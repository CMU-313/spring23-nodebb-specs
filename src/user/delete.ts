import async = require('async');
import _ = require('lodash');
import path = require('path');
import nconf = require('nconf');
import util = require('util');
import rimraf = require('rimraf');

import db = require('../database');
import posts = require('../posts');
import flags = require('../flags');
import topics = require('../topics');
import groups = require('../groups');
import messaging = require('../messaging');
import plugins = require('../plugins');
import batch = require('../batch');

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

interface deleting {
    delete?: (callerUid: string, uid: string) =>
Promise<UserData>;
    deleteContent?: (arg0: string, arg1: string) =>
Promise<void>;
    deleteAccount?: (arg0: string) =>
Promise<UserData>;
    deleteUpload?: (arg0: string, arg1: string, arg2: Array<string>) =>
Promise<UserData>;
    auth: {
        revokeAllSessions?: (arg0: string) => Promise<void>;
    };
    reset: {
        cleanByUid?: (arg0: string) => Promise<void>;
    }
}




const rimrafAsync = util.promisify(rimraf as (path: string, callback:
    (error: Error) => void) => void) as (path: string) => Promise<void>;

module.exports = function (User : deleting) {
    const deletesInProgress = {};

    User.delete = async (callerUid, uid) => {
        await User.deleteContent(callerUid, uid);
        return await User.deleteAccount(uid);
    };

    async function deletePosts(callerUid : string, uid : string) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await batch.processSortedSet(`uid:${uid}:posts`, async (pids: string) => { await posts.purge(pids, callerUid); }, { alwaysStartAt: 0, batch: 500 });
    }


    async function deleteTopicsHelper(tid : string, callerUid : string) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await topics.purge(tid, callerUid);
    }

    async function deleteTopics(callerUid : string, uid : string) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await batch.processSortedSet(`uid:${uid}:topics`, async (ids : string[]) => {
            const promises = [];
            for (const tid of ids) {
                promises.push(deleteTopicsHelper(tid, callerUid));
            }
            await Promise.all(promises);
        }, { alwaysStartAt: 0 });
    }
    async function deleteUploads(callerUid: string, uid: string) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const uploads: string[] = await db.getSortedSetMembers(`uid:${uid}:uploads`) as string[];
        await User.deleteUpload(callerUid, uid, uploads);
    }

    async function deleteQueuedHelper(id : string) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await posts.removeFromQueue(id);
    }

    async function deleteQueued(uid: string) {
        const deleteIds: string[] = [];
        await batch.processSortedSet('post:queue', async (ids: string[]) => {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            const data: Record<string, string>[] = await db.getObjects(ids.map((id: string) => `post:queue:${id}`)) as Record<string, string>[];
            const userQueuedIds = data.filter((d: { uid: string; }) => parseInt(d.uid, 10) === parseInt(uid, 10)).map((d: { id: string; }) => d.id);
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
    async function removeFromSortedSets(uid: string) {
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

    async function deleteVotesHelper(pid: string, uid: string) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await posts.unvote(pid, uid);
    }
    async function deleteVotes(uid: string) {
        const [upvotedPids, downvotedPids]: [string[], string[]] = await Promise.all([
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            db.getSortedSetRange(`uid:${uid}:upvote`, 0, -1) as Promise<[string]>,
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            db.getSortedSetRange(`uid:${uid}:downvote`, 0, -1) as Promise<[string]>,
        ]);
        const pids = _.uniq(upvotedPids.concat(downvotedPids).filter(Boolean));

        const promises = [];
        for (const pid of pids) {
            promises.push(deleteVotesHelper(pid, uid));
        }
    }

    async function deleteChats(uid: string) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const roomIds: string[] = await db.getSortedSetRange(`uid:${uid}:chat:rooms`, 0, -1) as string[];
        const userKeys: string[] = roomIds.map((roomId: string) => `uid:${uid}:chat:room:${roomId}:mids`);

        await Promise.all([
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            messaging.leaveRooms(uid, roomIds), db.deleteAll(userKeys),
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
        const userData : UserData = await db.getObject(`user:${uid}`);

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
        ];
        if (userData.email) {
            bulkRemove.push(['email:uid', userData.email.toLowerCase()]);
            bulkRemove.push(['email:sorted', `${userData.email.toLowerCase()}:${uid}`]);
        }

        if (userData.fullname) {
            bulkRemove.push(['fullname:sorted', `${userData.fullname.toLowerCase()}:${uid}`]);
        }

        await Promise.all([
            db.sortedSetRemoveBulk(bulkRemove),
            db.decrObjectField('global', 'userCount'),
            db.deleteAll(keys),
            db.setRemove('invitation:uids', uid),
            deleteUserIps(uid),
            deleteUserFromFollowers(uid),
            deleteImages(uid),
            groups.leaveAllGroups(uid),
            flags.resolveFlag('user', uid, uid),
            User.reset.cleanByUid(uid),
        ]);
        await db.deleteAll([`followers:${uid}`, `following:${uid}`, `user:${uid}`]);
        delete deletesInProgress[uid];
        return userData;
    };


    async function deleteUserIps(uid: string) {
        const ips = await db.getSortedSetRange(`uid:${uid}:ip`, 0, -1);
        await db.sortedSetsRemove(ips.map((ip: any) => `ip:${ip}:uid`), uid);
        await db.delete(`uid:${uid}:ip`);
    }

    async function deleteUserFromFollowers(uid: string) {
        const [followers, following] = await Promise.all([
            db.getSortedSetRange(`followers:${uid}`, 0, -1),
            db.getSortedSetRange(`following:${uid}`, 0, -1),
        ]);

        async function updateCount(uids: async.IterableCollection<unknown>, name: string, fieldName: string) {
            await async.each(uids, async (uid) => {
                let count = await db.sortedSetCard(name + uid);
                count = parseInt(count, 10) || 0;
                await db.setObjectField(`user:${uid}`, fieldName, count);
            });
        }

        const followingSets = followers.map((uid: any) => `following:${uid}`);
        const followerSets = following.map((uid: any) => `followers:${uid}`);

        await Promise.all([
            db.sortedSetsRemove(followerSets.concat(followingSets), uid),
            updateCount(following, 'followers:', 'followerCount'),
            updateCount(followers, 'following:', 'followingCount'),
        ]);
    }

    async function deleteImages(uid: string) {
        const folder = path.join(nconf.get('upload_path'), 'profile');
        await Promise.all([
            rimrafAsync(path.join(folder, `${uid}-profilecover*`)),
            rimrafAsync(path.join(folder, `${uid}-profileavatar*`)),
        ]);
    }
};