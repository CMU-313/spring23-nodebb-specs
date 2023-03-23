"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const _ = require("lodash");
const nconf = require("nconf");
const util = require("util");
const rimraf = require("rimraf");
const db = require("../database");
const posts = require("../posts");
const flags = require("../flags");
const topics = require("../topics");
const groups = require("../groups");
const messaging = require("../messaging");
const plugins = require("../plugins");
const batch = require("../batch");
const rimrafAsync = util.promisify(rimraf);
module.exports = function (User) {
    const deletesInProgress = {};
    User.delete = async (callerUid, uid) => {
        await User.deleteContent(callerUid, uid);
        return await User.deleteAccount(uid);
    };
    async function deletePosts(callerUid, uid) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await batch.processSortedSet(`uid:${uid}:posts`, async (pids) => { await posts.purge(pids, callerUid); }, { alwaysStartAt: 0, batch: 500 });
    }
    async function deleteTopicsHelper(tid, callerUid) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await topics.purge(tid, callerUid);
    }
    async function deleteTopics(callerUid, uid) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await batch.processSortedSet(`uid:${uid}:topics`, async (ids) => {
            const promises = [];
            for (const tid of ids) {
                promises.push(deleteTopicsHelper(tid, callerUid));
            }
            await Promise.all(promises);
        }, { alwaysStartAt: 0 });
    }
    async function deleteUploads(callerUid, uid) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const uploads = await db.getSortedSetMembers(`uid:${uid}:uploads`);
        await User.deleteUpload(callerUid, uid, uploads);
    }
    async function deleteQueuedHelper(id) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await posts.removeFromQueue(id);
    }
    async function deleteQueued(uid) {
        const deleteIds = [];
        await batch.processSortedSet('post:queue', async (ids) => {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            const data = await db.getObjects(ids.map((id) => `post:queue:${id}`));
            const userQueuedIds = data.filter((d) => parseInt(d.uid, 10) === parseInt(uid, 10)).map((d) => d.id);
            deleteIds.concat(userQueuedIds);
        }, { batch: 500 });
        const promises = [];
        for (const id of deleteIds) {
            promises.push(deleteQueuedHelper(id));
        }
        await Promise.all(promises);
    }
    User.deleteContent = async function (callerUid, uid) {
        if (parseInt(uid, 10) <= 0) {
            throw new Error('[[error:invalid-uid]]');
        }
        if (deletesInProgress[uid]) {
            throw new Error('[[error:already-deleting]]');
        }
        deletesInProgress[uid] = 'user.delete';
        await deletePosts(callerUid, uid);
        await deleteTopics(callerUid, uid);
        await deleteUploads(callerUid, uid);
        await deleteQueued(uid);
        delete deletesInProgress[uid];
    };
    async function removeFromSortedSets(uid) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await db.sortedSetsRemove([
            'users:joindate',
            'users:postcount',
            'users:reputation',
            'users:banned',
            'users:banned:expire',
            'users:flags',
            'users:online',
            'digest:day:uids',
            'digest:week:uids',
            'digest:biweek:uids',
            'digest:month:uids',
        ], uid);
    }
    async function deleteVotesHelper(pid, uid) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await posts.unvote(pid, uid);
    }
    async function deleteVotes(uid) {
        const [upvotedPids, downvotedPids] = await Promise.all([
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            db.getSortedSetRange(`uid:${uid}:upvote`, 0, -1),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            db.getSortedSetRange(`uid:${uid}:downvote`, 0, -1),
        ]);
        const pids = _.uniq(upvotedPids.concat(downvotedPids).filter(Boolean));
        const promises = [];
        for (const pid of pids) {
            promises.push(deleteVotesHelper(pid, uid));
        }
        await Promise.all(promises);
    }
    async function deleteChats(uid) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const roomIds = await db.getSortedSetRange(`uid:${uid}:chat:rooms`, 0, -1);
        const userKeys = roomIds.map((roomId) => `uid:${uid}:chat:room:${roomId}:mids`);
        await Promise.all([
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            messaging.leaveRooms(uid, roomIds), db.deleteAll(userKeys),
        ]);
    }
    async function deleteUserIps(uid) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const ips = await db.getSortedSetRange(`uid:${uid}:ip`, 0, -1);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await db.sortedSetsRemove(ips.map((ip) => `ip:${ip}:uid`), uid);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await db.delete(`uid:${uid}:ip`);
    }
    async function deleteUserFromFollowers(uid) {
        const [followers, following] = await Promise.all([
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            db.getSortedSetRange(`followers:${uid}`, 0, -1),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            db.getSortedSetRange(`following:${uid}`, 0, -1),
        ]);
        async function updateCountHelper(name, uid, fieldName) {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            // The next line calls a function in a module that has not been updated to TS yet
            /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
            const count = await db.sortedSetCard(name + uid);
            const count_ = parseInt(count, 10) || 0;
            await db.setObjectField(`user:${uid}`, fieldName, count_);
            /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
        }
        async function updateCount(uids, name, fieldName) {
            const promises = [];
            for (const uid of uids) {
                promises.push(updateCountHelper(name, uid, fieldName));
            }
            await Promise.all(promises);
        }
        const followingSets = followers.map((uid) => `following:${uid}`);
        const followerSets = following.map((uid) => `followers:${uid}`);
        await Promise.all([
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            db.sortedSetsRemove(followerSets.concat(followingSets), uid),
            updateCount(following, 'followers:', 'followerCount'),
            updateCount(followers, 'following:', 'followingCount'),
        ]);
    }
    async function deleteImages(uid) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const folder = path.join(nconf.get('upload_path'), 'profile');
        await Promise.all([
            rimrafAsync(path.join(folder, `${uid}-profilecover*`)),
            rimrafAsync(path.join(folder, `${uid}-profileavatar*`)),
        ]);
    }
    User.deleteAccount = async function (uid) {
        if (deletesInProgress[uid] === 'user.deleteAccount') {
            throw new Error('[[error:already-deleting]]');
        }
        deletesInProgress[uid] = 'user.deleteAccount';
        await removeFromSortedSets(uid);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const userData = await db.getObject(`user:${uid}`);
        if (!userData || !userData.username) {
            delete deletesInProgress[uid];
            throw new Error('[[error:no-user]]');
        }
        await plugins.hooks.fire('static:user.delete', { uid: uid, userData: userData });
        await deleteVotes(uid);
        await deleteChats(uid);
        await User.auth.revokeAllSessions(uid);
        const keys = [
            `uid:${uid}:notifications:read`,
            `uid:${uid}:notifications:unread`,
            `uid:${uid}:bookmarks`,
            `uid:${uid}:tids_read`,
            `uid:${uid}:tids_unread`,
            `uid:${uid}:followed_tids`,
            `uid:${uid}:ignored_tids`,
            `uid:${uid}:blocked_uids`,
            `user:${uid}:settings`,
            `user:${uid}:usernames`,
            `user:${uid}:emails`,
            `uid:${uid}:topics`, `uid:${uid}:posts`,
            `uid:${uid}:chats`, `uid:${uid}:chats:unread`,
            `uid:${uid}:chat:rooms`, `uid:${uid}:chat:rooms:unread`,
            `uid:${uid}:upvote`, `uid:${uid}:downvote`,
            `uid:${uid}:flag:pids`,
            `uid:${uid}:sessions`, `uid:${uid}:sessionUUID:sessionId`,
            `invitation:uid:${uid}`,
        ];
        const bulkRemove = [
            ['username:uid', userData.username],
            ['username:sorted', `${userData.username.toLowerCase()}:${uid}`],
            ['userslug:uid', userData.userslug],
            ['fullname:uid', userData.fullname],
            ['accounttype:uid', userData.accounttype],
        ];
        if (userData.email) {
            bulkRemove.push(['email:uid', userData.email.toLowerCase()]);
            bulkRemove.push(['email:sorted', `${userData.email.toLowerCase()}:${uid}`]);
        }
        if (userData.fullname) {
            bulkRemove.push(['fullname:sorted', `${userData.fullname.toLowerCase()}:${uid}`]);
        }
        await Promise.all([
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            db.sortedSetRemoveBulk(bulkRemove),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            db.decrObjectField('global', 'userCount'),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            db.deleteAll(keys),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            db.setRemove('invitation:uids', uid),
            deleteUserIps(uid),
            deleteUserFromFollowers(uid),
            deleteImages(uid),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            groups.leaveAllGroups(uid),
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            flags.resolveFlag('user', uid, uid),
            User.reset.cleanByUid(uid),
        ]);
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await db.deleteAll([`followers:${uid}`, `following:${uid}`, `user:${uid}`]);
        delete deletesInProgress[uid];
        return userData;
    };
};
