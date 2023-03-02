"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const zxcvbn_1 = __importDefault(require("zxcvbn"));
const winston_1 = __importDefault(require("winston"));
const database_1 = __importDefault(require("../database"));
const utils_1 = __importDefault(require("../utils"));
const slugify_1 = __importDefault(require("../slugify"));
const plugins_1 = __importDefault(require("../plugins"));
const groups_1 = __importDefault(require("../groups"));
const meta_1 = __importDefault(require("../meta"));
const analytics_1 = __importDefault(require("../analytics"));
const _1 = __importDefault(require("."));
module.exports = function (User) {
    async function lock(value, error) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const count = await database_1.default.incrObjectField('locks', value);
        if (count > 1) {
            throw new Error(error);
        }
    }
    async function storePassword(uid, password) {
        if (!password) {
            return;
        }
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const hash = await _1.default.hashPassword(password);
        await Promise.all([
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            _1.default.setUserFields(uid, {
                password: hash,
                'password:shaWrapped': 1,
            }),
            _1.default.reset.updateExpiry(uid),
        ]);
    }
    async function create(data) {
        const timestamp = data.timestamp || Date.now();
        let userData = {
            username: data.username,
            userslug: data.userslug,
            accounttype: data['account-type'] || 'student',
            email: data.email || '',
            joindate: timestamp,
            lastonline: timestamp,
            status: 'online',
            acceptTos: 0,
            uid: 0,
            fullname: '',
            password: '',
        };
        ['picture', 'fullname', 'location', 'birthday'].forEach((field) => {
            if (data[field]) {
                userData[field] = data[field];
            }
        });
        if (data.gdpr_consent === true || data.gdpr_consent === 1) {
            userData.gdpr_consent = true;
        }
        if (data.acceptTos === true) {
            userData.acceptTos = 1;
        }
        const renamedUsername = await User.uniqueUsername(userData);
        const userNameChanged = !!renamedUsername;
        if (userNameChanged) {
            userData.username = renamedUsername;
            userData.userslug = (0, slugify_1.default)(renamedUsername);
        }
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        const results = await plugins_1.default.hooks.fire('filter:user.create', { user: userData, data: data });
        userData = results.user;
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const uid = await database_1.default.incrObjectField('global', 'nextUid');
        const isFirstUser = uid === 1;
        userData.uid = uid;
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await database_1.default.setObject(`user:${uid}`, userData);
        const bulkAdd = [
            ['username:uid', userData.uid, userData.username],
            [`user:${userData.uid}:usernames`, timestamp, `${userData.username}:${timestamp}`],
            ['accounttype:uid', userData.uid, userData.accounttype],
            ['username:sorted', 0, `${userData.username.toLowerCase()}:${userData.uid}`],
            ['userslug:uid', userData.uid, userData.userslug],
            ['users:joindate', timestamp, userData.uid],
            ['users:online', timestamp, userData.uid],
            ['users:postcount', 0, userData.uid],
            ['users:reputation', 0, userData.uid],
        ];
        if (userData.fullname) {
            bulkAdd.push(['fullname:sorted', 0, `${userData.fullname.toLowerCase()}:${userData.uid}`]);
        }
        await Promise.all([
            /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
            database_1.default.incrObjectField('global', 'userCount'),
            analytics_1.default.increment('registrations'),
            database_1.default.sortedSetAddBulk(bulkAdd),
            groups_1.default.join(['registered-users', 'unverified-users'], userData.uid),
            _1.default.notifications.sendWelcomeNotification(userData.uid),
            storePassword(userData.uid, data.password),
            _1.default.updateDigestSetting(userData.uid, meta_1.default.config.dailyDigestFreq),
            /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
        ]);
        if (userData.email && isFirstUser) {
            await _1.default.email.confirmByUid(userData.uid);
        }
        if (userData.email && userData.uid > 1) {
            await _1.default.email.sendValidationEmail(userData.uid, {
                email: userData.email,
                template: 'welcome',
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
                subject: `[[email:welcome-to, ${meta_1.default.config.title || meta_1.default.config.browserTitle || 'NodeBB'}]]`,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
            }).catch(err => winston_1.default.error(`[user.create] Validation email failed to send\n[emailer.send] ${err.stack}`));
        }
        if (userNameChanged) {
            await _1.default.notifications.sendNameChangeNotification(userData.uid, userData.username);
        }
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        await plugins_1.default.hooks.fire('action:user.create', { user: userData, data: data });
        return userData.uid;
    }
    User.create = async function (data) {
        data.username = data.username.trim();
        data.userslug = (0, slugify_1.default)(data.username);
        if (data.email !== undefined) {
            data.email = String(data.email).trim();
        }
        if (data['account-type'] !== undefined) {
            data.accounttype = data['account-type'].trim();
        }
        await User.isDataValid(data);
        await lock(data.username, '[[error:username-taken]]');
        if (data.email && data.email !== data.username) {
            await lock(data.email, '[[error:email-taken]]');
        }
        try {
            return await create(data);
        }
        finally {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
            await database_1.default.deleteObjectFields('locks', [data.username, data.email]);
        }
    };
    User.isDataValid = async function (userData) {
        if (userData.email && !utils_1.default.isEmailValid(userData.email)) {
            throw new Error('[[error:invalid-email]]');
        }
        if (!utils_1.default.isUserNameValid(userData.username) || !userData.userslug) {
            throw new Error(`[[error:invalid-username, ${userData.username}]]`);
        }
        if (userData.password) {
            User.isPasswordValid(userData.password);
        }
        if (userData.email) {
            const available = await _1.default.email.available(userData.email);
            if (!available) {
                throw new Error('[[error:email-taken]]');
            }
        }
    };
    User.isPasswordValid = function (password, minStrength) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
        minStrength = (minStrength || minStrength === 0) ? minStrength : meta_1.default.config.minimumPasswordStrength;
        // Sanity checks: Checks if defined and is string
        if (!password || !utils_1.default.isPasswordValid(password)) {
            throw new Error('[[error:invalid-password]]');
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
        if (password.length < meta_1.default.config.minimumPasswordLength) {
            throw new Error('[[reset_password:password_too_short]]');
        }
        if (password.length > 512) {
            throw new Error('[[error:password-too-long]]');
        }
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const strength = (0, zxcvbn_1.default)(password);
        if (strength.score < minStrength) {
            throw new Error('[[user:weak_password]]');
        }
    };
    User.uniqueUsername = async function (userData) {
        let numTries = 0;
        let { username } = userData;
        while (true) {
            // The next line calls a function in a module that has not been updated to TS yet
            /* eslint-disable @typescript-eslint/no-unsafe-assignment, no-await-in-loop */
            const exists = await meta_1.default.userOrGroupExists(username);
            /* eslint-enable @typescript-eslint/no-unsafe-assignment, no-await-in-loop */
            if (!exists) {
                return numTries ? username : null;
            }
            username = `${userData.username} ${numTries.toString(32)}`;
            numTries += 1;
        }
    };
};
