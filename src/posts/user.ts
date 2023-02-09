import async = require('async');
import validator = require('validator');
import _ = require('lodash');

import db = require('../database');
import user = require('../user');
import topics = require('../topics');
import groups = require('../groups');
import meta = require('../meta');
import plugins = require('../plugins');
import privileges = require('../privileges');

type PostObject = {
    votes: number;
};

type UserData = {
    uid: number,
    username: string,
    fullname: string,
    userslug: string,
    reputation: number,
    postcount: number,
    topiccount: number,
    picture: string,
    signature: string,
    banned: boolean,
    'banned:expire': number,
    status: string,
    lastonline: number,
    groupTitle: string,
    mutedUntil: number,
    accounttype: string,
    uploadedpicture: string,
    displayname: string,
    groupTitleArray: string[],
    'icon:text': string,
    'icon:bgColor': string,
    lastonlineISO: string,
    banned_until: number,
    banned_until_readable: string,
    muted: boolean,
    selectedGroups: number[],
    custom_profile_info: any
}

type GroupData = {
    name: string,
    slug: string,
    labelColor: string,
    textColor: string,
    icon: string,
    userTitle: string,
    userTitleEnabled: boolean,
    hidden: boolean,
}

type UserDataResults = {
    fields: string[],
    uid: string,
    uids: string[],
}

module.exports = function (Posts) {
    async function getUserData(uids: string[], uid: string): Promise<UserData[]> {
        const fields = [
            'uid', 'username', 'fullname', 'userslug',
            'reputation', 'postcount', 'topiccount', 'picture',
            'signature', 'banned', 'banned:expire', 'status',
            'lastonline', 'groupTitle', 'mutedUntil', 'accounttype',
        ];
        const result: UserDataResults = await plugins.hooks.fire('filter:posts.addUserFields', {
            fields: fields,
            uid: uid,
            uids: uids,
        }) as UserDataResults;
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        return await user.getUsersFields(result.uids, _.uniq(result.fields)) as UserData[];
    }

    Posts.getUserInfoForPosts = async function (uids: string[], uid: string): Promise<void> {
        const [userData, userSettings, signatureUids]: [UserData[], any, string[]] = await Promise.all([
            getUserData(uids, uid),
            user.getMultipleUserSettings(uids),
            privileges.global.filterUids('signature', uids),
        ]);
        console.log(userSettings);
        const uidsSignatureSet: Set<number> = new Set(signatureUids.map(uid => parseInt(uid, 10)));
        const groupsMap: Map<string, GroupData> = await getGroupsMap(userData);
        userData.forEach((userData, index) => {
            userData.signature = validator.escape(String(userData.signature || ''));
            userData.fullname = userSettings[index].showfullname ? validator.escape(String(userData.fullname || '')) : undefined;
            userData.selectedGroups = [];

            if (meta.config.hideFullname) {
                userData.fullname = undefined;
            }
        });

        const result = await Promise.all(userData.map(async (userData) => {
            const [isMemberOfGroups, signature, customProfileInfo]: [boolean, string, any] = await Promise.all([
                checkGroupMembership(userData.uid, userData.groupTitleArray),
                parseSignature(userData, uid, uidsSignatureSet),
                plugins.hooks.fire('filter:posts.custom_profile_info', { profile: [], uid: userData.uid }),
            ]);

            if (isMemberOfGroups && userData.groupTitleArray) {
                userData.groupTitleArray.forEach((userGroup, index) => {
                    if (isMemberOfGroups[index] && groupsMap[userGroup]) {
                        userData.selectedGroups.push(groupsMap[userGroup]);
                    }
                });
            }
            userData.signature = signature;
            userData.custom_profile_info = customProfileInfo.profile;

            return await plugins.hooks.fire('filter:posts.modifyUserInfo', userData);
        }));
        const hookResult = await plugins.hooks.fire('filter:posts.getUserInfoForPosts', { users: result });
        // console.log('pee'+ hookResult.users);
        return hookResult.users;
    };

    Posts.overrideGuestHandle = function (postData, handle) {
        if (meta.config.allowGuestHandles && postData && postData.user && parseInt(postData.uid, 10) === 0 && handle) {
            postData.user.username = validator.escape(String(handle));
            if (postData.user.hasOwnProperty('fullname')) {
                postData.user.fullname = postData.user.username;
            }
            postData.user.displayname = postData.user.username;
        }
    };

    async function checkGroupMembership(uid, groupTitleArray) {
        if (!Array.isArray(groupTitleArray) || !groupTitleArray.length) {
            return null;
        }
        return await groups.isMemberOfGroups(uid, groupTitleArray);
    }

    async function parseSignature(userData, uid: string, signatureUids: Set<number>): Promise<string> {
    if (!userData.signature || !signatureUids.has(userData.uid) || meta.config.disableSignatures) {
            return '';
        }
        const result = await Posts.parseSignature(userData, uid);
        return result.userData.signature;
    }

    async function getGroupsMap(userData): Promise<Map<string, GroupData>> {
        const groupTitles: string[] = _.uniq(_.flatten(userData.map(u => u && u.groupTitleArray)));
        const groupsMap: Map<string, GroupData> = new Map<string, GroupData>;
        const groupsData: GroupData[] = await groups.getGroupsData(groupTitles);
        groupsData.forEach((group) => {
            if (group && group.userTitleEnabled && !group.hidden) {
                groupsMap[group.name] = {
                    name: group.name,
                    slug: group.slug,
                    labelColor: group.labelColor,
                    textColor: group.textColor,
                    icon: group.icon,
                    userTitle: group.userTitle,
                };
            }
        });
        return groupsMap;
    }

    Posts.isOwner = async function (pids, uid) {
        uid = parseInt(uid, 10);
        const isArray = Array.isArray(pids);
        pids = isArray ? pids : [pids];
        if (uid <= 0) {
            return isArray ? pids.map(() => false) : false;
        }
        const postData = await Posts.getPostsFields(pids, ['uid']);
        const result = postData.map(post => post && post.uid === uid);
        return isArray ? result : result[0];
    };

    Posts.isModerator = async function (pids, uid: string): Promise<boolean> {
        if (parseInt(uid, 10) <= 0) {
            return pids.map(() => false);
        }
        const cids = await Posts.getCidsByPids(pids);
        return await user.isModerator(uid, cids);
    };

    Posts.changeOwner = async function (pids, toUid) {
        const exists = await user.exists(toUid);
        if (!exists) {
            throw new Error('[[error:no-user]]');
        }
        let postData = await Posts.getPostsFields(pids, [
            'pid', 'tid', 'uid', 'content', 'deleted', 'timestamp', 'upvotes', 'downvotes',
        ]);
        postData = postData.filter(p => p.pid && p.uid !== parseInt(toUid, 10));
        pids = postData.map(p => p.pid);

        const cids = await Posts.getCidsByPids(pids);

        const bulkRemove = [];
        const bulkAdd = [];
        let repChange = 0;
        const postsByUser = {};
        postData.forEach((post, i) => {
            post.cid = cids[i];
            repChange += post.votes;
            bulkRemove.push([`uid:${post.uid}:posts`, post.pid]);
            bulkRemove.push([`cid:${post.cid}:uid:${post.uid}:pids`, post.pid]);
            bulkRemove.push([`cid:${post.cid}:uid:${post.uid}:pids:votes`, post.pid]);

            bulkAdd.push([`uid:${toUid}:posts`, post.timestamp, post.pid]);
            bulkAdd.push([`cid:${post.cid}:uid:${toUid}:pids`, post.timestamp, post.pid]);
            if (post.votes > 0 || post.votes < 0) {
                bulkAdd.push([`cid:${post.cid}:uid:${toUid}:pids:votes`, post.votes, post.pid]);
            }
            postsByUser[post.uid] = postsByUser[post.uid] || [];
            postsByUser[post.uid].push(post);
        });

        await Promise.all([
            db.setObjectField(pids.map(pid => `post:${pid}`), 'uid', toUid),
            db.sortedSetRemoveBulk(bulkRemove),
            db.sortedSetAddBulk(bulkAdd),
            user.incrementUserReputationBy(toUid, repChange),
            handleMainPidOwnerChange(postData, toUid),
            updateTopicPosters(postData, toUid),
        ]);

        await Promise.all([
            user.updatePostCount(toUid),
            reduceCounters(postsByUser),
        ]);

        plugins.hooks.fire('action:post.changeOwner', {
            posts: _.cloneDeep(postData),
            toUid: toUid,
        });
        return postData;
    };

    async function reduceCounters(postsByUser: async.IterableCollection<PostObject[]>) {
        await async.eachOfSeries(postsByUser, async (posts: PostObject[], uid: string | number): Promise<void> => {
            const repChange = posts.reduce((acc, val) => acc + val.votes, 0);
            await Promise.all([
                user.updatePostCount(uid),
                user.incrementUserReputationBy(uid, -repChange),
            ]);
        });
    }

    async function updateTopicPosters(postData, toUid) {
        const postsByTopic = _.groupBy(postData, p => parseInt(p.tid, 10));
        await async.eachOf(postsByTopic, async (posts, tid) => {
            const postsByUser = _.groupBy(posts, p => parseInt(p.uid, 10));
            await db.sortedSetIncrBy(`tid:${tid}:posters`, posts.length, toUid);
            await async.eachOf(postsByUser, async (posts, uid) => {
                await db.sortedSetIncrBy(`tid:${tid}:posters`, -posts.length, uid);
            });
        });
    }

    type Topic = {
        tid:number,
        cid: number,
        deleted: boolean,
        title:string, 
        uid: number,
        mainPid: number,
        timestamp:number,
    }
    async function handleMainPidOwnerChange(postData, toUid) {
        const tids: number[] = _.uniq(postData.map(p => p.tid));
        const topicData = await topics.getTopicsFields(tids, [
            'tid', 'cid', 'deleted', 'title', 'uid', 'mainPid', 'timestamp',
        ]);
        const tidToTopic: _.Dictionary<Topic> = _.zipObject(tids, topicData);

        const mainPosts = postData.filter(p => p.pid === tidToTopic[p.tid].mainPid);
        if (!mainPosts.length) {
            return;
        }

        const bulkAdd = [];
        const bulkRemove = [];
        const postsByUser = {};
        mainPosts.forEach((post) => {
            bulkRemove.push([`cid:${post.cid}:uid:${post.uid}:tids`, post.tid]);
            bulkRemove.push([`uid:${post.uid}:topics`, post.tid]);

            bulkAdd.push([`cid:${post.cid}:uid:${toUid}:tids`, tidToTopic[post.tid].timestamp, post.tid]);
            bulkAdd.push([`uid:${toUid}:topics`, tidToTopic[post.tid].timestamp, post.tid]);
            postsByUser[post.uid] = postsByUser[post.uid] || [];
            postsByUser[post.uid].push(post);
        });

        await Promise.all([
            db.setObjectField(mainPosts.map(p => `topic:${p.tid}`), 'uid', toUid),
            db.sortedSetRemoveBulk(bulkRemove),
            db.sortedSetAddBulk(bulkAdd),
            user.incrementUserFieldBy(toUid, 'topiccount', mainPosts.length),
            reduceTopicCounts(postsByUser),
        ]);

        const changedTopics = mainPosts.map(p => tidToTopic[p.tid]);
        plugins.hooks.fire('action:topic.changeOwner', {
            topics: _.cloneDeep(changedTopics),
            toUid: toUid,
        });
    }

    async function reduceTopicCounts(postsByUser) {
        await async.eachSeries(Object.keys(postsByUser), async (uid) => {
            const posts = postsByUser[uid];
            const exists = await user.exists(uid);
            if (exists) {
                await user.incrementUserFieldBy(uid, 'topiccount', -posts.length);
            }
        });
    }
};
