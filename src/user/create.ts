import zxcvbn from 'zxcvbn';
import winston from 'winston';

import db from '../database';
import utils from '../utils';
import slugify from '../slugify';
import plugins from '../plugins';
import groups from '../groups';
import meta from '../meta';
import analytics from '../analytics';

import user from '.';

type Data = {
    username: string,
    userslug: string,
    accounttype: string,
    email: string,
    joindate: number,
    lastonline: number,
    status: string,
    gdpr_consent?: boolean | number,
    acceptTos: boolean,
    uid: number,
    fullname: string,
    password: string,
    timestamp: number,
}

type UserData = {
    username: string,
    userslug: string,
    accounttype: string,
    email: string,
    joindate: number,
    lastonline: number,
    status: string,
    gdpr_consent?: boolean,
    acceptTos: number,
    uid: number,
    fullname: string,
    password: string,
}

type Result = {
    user: UserData,
    data: Data,
}

interface TheUser {
    create?: (data: Data) => Promise<number>;
    isDataValid?: (userData: Data) => Promise<void>;
    isPasswordValid?: (password: string, minStrength?: number) => void;
    uniqueUsername?: (userData: UserData) => Promise<string>;
}

export = function (User: TheUser) {
    async function lock(value: string, error: string): Promise<void> {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const count: number = await db.incrObjectField('locks', value) as number;
        if (count > 1) {
            throw new Error(error);
        }
    }

    async function storePassword(uid : number, password: string): Promise<number> {
        if (!password) {
            return;
        }
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const hash: number = await user.hashPassword(password) as number;
        await Promise.all([
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            user.setUserFields(uid, {
                password: hash,
                'password:shaWrapped': 1,
            }),
            user.reset.updateExpiry(uid),
        ]);
    }

    async function create(data: Data): Promise<number> {
        const timestamp: number = data.timestamp || Date.now();

        let userData : UserData = {
            username: data.username,
            userslug: data.userslug,
            accounttype: (data['account-type'] as string) || 'student',
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
                userData[field] = data[field] as string;
            }
        });
        if (data.gdpr_consent === true || data.gdpr_consent === 1) {
            userData.gdpr_consent = true;
        }
        if (data.acceptTos === true) {
            userData.acceptTos = 1;
        }

        const renamedUsername: string = await User.uniqueUsername(userData);
        const userNameChanged = !!renamedUsername;
        if (userNameChanged) {
            userData.username = renamedUsername;
            userData.userslug = slugify(renamedUsername) as string;
        }

        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        const results: Result = await plugins.hooks.fire('filter:user.create', { user: userData, data: data }) as Result;
        userData = results.user;

        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const uid: number = await db.incrObjectField('global', 'nextUid') as number;
        const isFirstUser: boolean = uid === 1;
        userData.uid = uid;
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.setObject(`user:${uid}`, userData);

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
            db.incrObjectField('global', 'userCount'),
            analytics.increment('registrations'),
            db.sortedSetAddBulk(bulkAdd),
            groups.join(['registered-users', 'unverified-users'], userData.uid),
            user.notifications.sendWelcomeNotification(userData.uid),
            storePassword(userData.uid, data.password),
            user.updateDigestSetting(userData.uid, meta.config.dailyDigestFreq),
            /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
        ]);

        if (userData.email && isFirstUser) {
            await user.email.confirmByUid(userData.uid);
        }

        if (userData.email && userData.uid > 1) {
            await user.email.sendValidationEmail(userData.uid, {
                email: userData.email,
                template: 'welcome',
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
                subject: `[[email:welcome-to, ${(meta.config.title as string) || (meta.config.browserTitle as string) || 'NodeBB'}]]`,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
            }).catch(err => winston.error(`[user.create] Validation email failed to send\n[emailer.send] ${err.stack as string}`));
        }
        if (userNameChanged) {
            await user.notifications.sendNameChangeNotification(userData.uid, userData.username);
        }
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        await plugins.hooks.fire('action:user.create', { user: userData, data: data });
        return userData.uid;
    }

    User.create = async function (data: Data): Promise<number> {
        data.username = data.username.trim();
        data.userslug = slugify(data.username) as string;
        if (data.email !== undefined) {
            data.email = String(data.email).trim();
        }
        if (data['account-type'] !== undefined) {
            data.accounttype = (data['account-type'] as string).trim();
        }

        await User.isDataValid(data);

        await lock(data.username, '[[error:username-taken]]');
        if (data.email && data.email !== data.username) {
            await lock(data.email, '[[error:email-taken]]');
        }

        try {
            return await create(data);
        } finally {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
            await db.deleteObjectFields('locks', [data.username, data.email]);
        }
    };

    User.isDataValid = async function (userData: Data): Promise<void> {
        if (userData.email && !utils.isEmailValid(userData.email)) {
            throw new Error('[[error:invalid-email]]');
        }

        if (!utils.isUserNameValid(userData.username) || !userData.userslug) {
            throw new Error(`[[error:invalid-username, ${userData.username}]]`);
        }

        if (userData.password) {
            User.isPasswordValid(userData.password);
        }

        if (userData.email) {
            const available = await user.email.available(userData.email);
            if (!available) {
                throw new Error('[[error:email-taken]]');
            }
        }
    };

    User.isPasswordValid = function (password: string, minStrength?: number): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
        minStrength = (minStrength || minStrength === 0) ? minStrength : meta.config.minimumPasswordStrength as number;

        // Sanity checks: Checks if defined and is string
        if (!password || !utils.isPasswordValid(password)) {
            throw new Error('[[error:invalid-password]]');
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
        if (password.length < meta.config.minimumPasswordLength) {
            throw new Error('[[reset_password:password_too_short]]');
        }

        if (password.length > 512) {
            throw new Error('[[error:password-too-long]]');
        }

        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const strength: { score: number} = zxcvbn(password);
        if (strength.score < minStrength) {
            throw new Error('[[user:weak_password]]');
        }
    };

    User.uniqueUsername = async function (userData: UserData): Promise<string> {
        let numTries = 0;
        let { username } = userData;
        while (true) {
            // The next line calls a function in a module that has not been updated to TS yet
            /* eslint-disable @typescript-eslint/no-unsafe-assignment, no-await-in-loop */
            const exists: boolean = await meta.userOrGroupExists(username);
            /* eslint-enable @typescript-eslint/no-unsafe-assignment, no-await-in-loop */
            if (!exists) {
                return numTries ? username : null;
            }
            username = `${userData.username} ${numTries.toString(32)}`;
            numTries += 1;
        }
    };
}
