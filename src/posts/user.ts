import async = require('async')
import validator = require('validator')
import _ = require('lodash')

import db = require('../database')
import user = require('../user')
import topics = require('../topics')
import groups = require('../groups')
import meta = require('../meta')
import plugins = require('../plugins')
import privileges = require('../privileges')

export interface PostsUser {
  getUserData: (uids: string[], uid: string) => Promise<UserData[]>
  getGroupsMap: (userData: UserData[]) => Promise<Map<string, GroupData>>
  getUserInfoForPosts: (uids: string[], uid: string) => Promise<UserData[]>
  isOwner: (pids: number[] | number, uid: string) => Promise<boolean | boolean[]>
  overrideGuestHandle: (postData: PostData, handle: string) => void
  isModerator: (pids: number[], uid: string) => Promise<boolean[]>
  changeOwner: (pids: number[], toUid: string) => Promise<PostData[]>
  getCidsByPids: (pids: number[]) => Promise<number[]>
  getPostsFields: (pids: number[], str: string[]) => Promise<PostData[]>
  parseSignature: (userData: UserData, uid: string) => Promise<{ userData: UserData }>
}

interface UserData {
  uid: number
  username: string
  fullname: string | undefined
  userslug: string
  reputation: number
  postcount: number
  topiccount: number
  picture: string
  signature: string
  banned: boolean
  'banned:expire': number
  status: string
  lastonline: number
  groupTitle: string
  mutedUntil: number
  accounttype: string
  uploadedpicture: string
  displayname: string
  groupTitleArray: string[]
  'icon:text': string
  'icon:bgColor': string
  lastonlineISO: string
  banned_until: number
  banned_until_readable: string
  muted: boolean
  selectedGroups: GroupData[]
  custom_profile_info: string[]
}

interface GroupData {
  name: string
  slug: string
  labelColor: string
  textColor: string
  icon: string
  userTitle: string
  userTitleEnabled: boolean
  hidden: boolean
}

interface UserDataResults {
  fields: string[]
  uid: string
  uids: string[]
}

interface UserSettings {
  uid: number
  showemail: boolean
  showfullname: boolean
  openOutgoingLinksInNewTab: boolean
  dailyDigestFreq: string
  usePagination: boolean
  topicsPerPage: number
  postsPerPage: number
  userLang: string
  acpLang: string
  topicPostSort: string
  categoryTopicSort: string
  followTopicsOnCreate: boolean
  followTopicsOnReply: boolean
  upvoteNotifFreq: string
  restrictChat: boolean
  topicSearchEnabled: boolean
  updateUrlWithPostIndex: boolean
  bootswatchSkin: string
  homePageRoute: string
  scrollToMyPost: boolean
  categoryWatchState: string
  notificationType_upvote: string
  'notificationType_new-topic': string
  'notificationType_new-reply': string
  'notificationType_post-edit': string
  notificationType_follow: string
  'notificationType_new-chat': string
  'notificationType_new-group-chat': string
  'notificationType_group-invite': string
  'notificationType_group-leave': string
  'notificationType_group-request-membership': string
  'notificationType_new-register': string
  'notificationType_post-queue': string
  'notificationType_new-post-flag': string
  'notificationType_new-user-flag': string
}

interface PostData {
  uid: string
  user: UserData
  votes: number
  upvotes: number
  downvotes: number
  timestampISO: string
  pid: number
  tid: number
  cid: number
  content: string
  deleted: number
  timestamp: number
}

module.exports = function (Posts: PostsUser) {
  async function getUserData (uids: string[], uid: string): Promise<UserData[]> {
    const fields = [
      'uid', 'username', 'fullname', 'userslug',
      'reputation', 'postcount', 'topiccount', 'picture',
      'signature', 'banned', 'banned:expire', 'status',
      'lastonline', 'groupTitle', 'mutedUntil', 'accounttype'
    ]
    const result: UserDataResults = await plugins.hooks.fire('filter:posts.addUserFields', {
      fields,
      uid,
      uids
    }) as UserDataResults
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return await user.getUsersFields(result.uids, _.uniq(result.fields)) as UserData[]
  }

  async function getGroupsMap (userData: UserData[]): Promise<Map<string, GroupData>> {
    const groupTitles: string[] = _.uniq(_.flatten(userData.map(u => u && u.groupTitleArray)))
    const groupsMap: Map<string, GroupData> = new Map<string, GroupData>()
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const groupsData: GroupData[] = await groups.getGroupsData(groupTitles) as GroupData[]
    groupsData.forEach((group) => {
      if (group && group.userTitleEnabled && !group.hidden) {
        groupsMap[group.name] = {
          name: group.name,
          slug: group.slug,
          labelColor: group.labelColor,
          textColor: group.textColor,
          icon: group.icon,
          userTitle: group.userTitle
        }
      }
    })
    return groupsMap
  }

  async function checkGroupMembership (uid, groupTitleArray): Promise<boolean[] | null> {
    if (!Array.isArray(groupTitleArray) || (groupTitleArray.length === 0)) {
      return null
    }
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return await groups.isMemberOfGroups(uid, groupTitleArray) as boolean[]
  }

  async function parseSignature (userData: UserData, uid: string, signatureUids: Set<number>): Promise<string> {
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    if (!userData.signature || !signatureUids.has(userData.uid) || meta.config.disableSignatures) {
      return ''
    }
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const result: { userData: UserData } = await Posts.parseSignature(userData, uid) as { userData: UserData }
    return result.userData.signature
  }

  Posts.getUserInfoForPosts = async function (uids: string[], uid: string): Promise<UserData[]> {
    const [userData, userSettings, signatureUids]: [UserData[], UserSettings[], string[]] = await Promise.all([
      getUserData(uids, uid),
      // The next line calls a function in a module that has not been updated to TS yet
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      user.getMultipleUserSettings(uids) as UserSettings[],
      privileges.global.filterUids('signature', uids) as string[]
    ])
    const uidsSignatureSet: Set<number> = new Set(signatureUids.map(uid => parseInt(uid, 10)))
    const groupsMap: Map<string, GroupData> = await getGroupsMap(userData)
    userData.forEach((userData, index) => {
      // The next line calls a function in a module that has not been updated to TS yet
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      userData.signature = validator.escape(String(userData.signature || '')) as string
      // The next line calls a function in a module that has not been updated to TS yet
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      userData.fullname = userSettings[index].showfullname ? (validator.escape(String(userData.fullname || '')) as string) : ''
      userData.selectedGroups = []
      // The next line calls a function in a module that has not been updated to TS yet
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (meta.config.hideFullname) {
        userData.fullname = undefined
      }
    })

    interface CustomProfileInfo {
      uid: number
      profile: string[]
    }
    // type Profile
    const result: UserData[] = await Promise.all(userData.map(async (userData) => {
      const [isMemberOfGroups, signature, customProfileInfo]: [boolean[] | null, string, CustomProfileInfo] =
                await Promise.all([
                  checkGroupMembership(userData.uid, userData.groupTitleArray),
                  parseSignature(userData, uid, uidsSignatureSet),
                  plugins.hooks.fire('filter:posts.custom_profile_info', {
                    profile: [], uid: userData.uid
                  }) as CustomProfileInfo
                ])
      if (isMemberOfGroups && userData.groupTitleArray) {
        userData.groupTitleArray.forEach((userGroup, index) => {
          if (isMemberOfGroups[index] && groupsMap[userGroup]) {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            userData.selectedGroups.push(groupsMap[userGroup])
          }
        })
      }
      userData.signature = signature
      userData.custom_profile_info = customProfileInfo.profile
      return await plugins.hooks.fire('filter:posts.modifyUserInfo', userData) as UserData
    }))
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const hookResult: { users: UserData[] } = await plugins.hooks.fire('filter:posts.getUserInfoForPosts', { users: result })
    return hookResult.users
  }

  Posts.overrideGuestHandle = function (postData: PostData, handle: string) {
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (meta.config.allowGuestHandles && postData && postData.user && parseInt(postData.uid, 10) === 0 && handle) {
      // The next line calls a function in a module that has not been updated to TS yet
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      postData.user.username = validator.escape(String(handle)) as string
      if (postData.user.hasOwnProperty('fullname')) {
        postData.user.fullname = postData.user.username
      }
      postData.user.displayname = postData.user.username
    }
  }

  Posts.isOwner = async function (pids: number[] | number, uid: string): Promise<boolean | boolean[]> {
    const numUID: number = parseInt(uid, 10)
    const isArray = Array.isArray(pids)
    if (typeof pids === 'number') {
      pids = [pids]
    }
    if (numUID <= 0) {
      return isArray ? pids.map(() => false) : false
    }
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const postData: PostData[] = await Posts.getPostsFields(pids, ['uid'])
    const result = postData.map(post => post && post.uid === uid)
    return isArray ? result : result[0]
  }

  Posts.isModerator = async function (pids: number[], uid: string): Promise<boolean[]> {
    if (parseInt(uid, 10) <= 0) {
      return Array(pids.length).fill(false) as boolean[]
    }
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const cids: number[] = await Posts.getCidsByPids(pids)
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    return await user.isModerator(uid, cids) as boolean[]
  }

  async function reduceCounters (postsByUser: async.IterableCollection<PostData[]>) {
    const promises = []
    // The next line triggers the linter in that it doesn't want an await inside a loop
    // in case the loop can be parallelized instead, however this loop must be run in order or it fails the tests
    // eslint-disable-next-line no-await-in-loop
    for (const uid of Object.keys(postsByUser)) {
      const repChange = (postsByUser[uid] as PostData[]).reduce((acc, val) => acc + val.votes, 0)
      // eslint-disable-next-line no-await-in-loop
      await Promise.all([
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        user.updatePostCount(uid),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        user.incrementUserReputationBy(uid, -repChange)
      ])
    }
    await Promise.all(promises)
  }

  async function updatePostsByUser (tid: string, posts: PostData[], uid: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    await db.sortedSetIncrBy(`tid:${tid}:posters`, -posts.length, uid)
  }

  async function updateTopic (
    tid: string, posts: PostData[], toUid: string, postsByUser: { [key: string]: PostData[] }
  ) {
    // The next few lines call a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    await db.sortedSetIncrBy(`tid:${tid}:posters`, posts.length, toUid)
    const promises: Promise<void>[] = []
    for (const uid of Object.keys(postsByUser)) {
      promises.push(updatePostsByUser(tid, posts, uid))
    }
    await Promise.all(promises)
  }

  async function updateTopicPosters (postData: PostData[], toUid: string) {
    const promises: Promise<void>[] = []
    const postsByTopic = _.groupBy(postData, p => p.tid)
    // console.log(postsByTopic)
    for (const tid of Object.keys(postsByTopic)) {
      const posts = postsByTopic[tid]
      const postsByUser = _.groupBy(posts, p => parseInt(p.uid, 10))
      promises.push(updateTopic(tid, posts, toUid, postsByUser))
    }
    await Promise.all(promises)
  }

  interface Topic {
    tid: number
    cid: number
    deleted: boolean
    title: string
    uid: number
    mainPid: number
    timestamp: number
  }

  async function userIncrement (uid, posts: PostData[]) {
    const exists: boolean = await user.exists(uid) as boolean
    if (exists) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await user.incrementUserFieldBy(uid, 'topiccount', -posts.length)
    }
  }
  async function reduceTopicCounts (postsByUser: { [key: string]: PostData[] }): Promise<Promise<void>> {
    const promises: Promise<void>[] = []
    for (const uid of Object.keys(postsByUser)) {
      const posts = postsByUser[uid]
      promises.push(userIncrement(uid, posts))
    }
    await Promise.all(promises)
  }

  async function handleMainPidOwnerChange (postData: PostData[], toUid: string) {
    const tids: number[] = _.uniq(postData.map(p => p.tid))
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const topicData: Topic[] = await topics.getTopicsFields(tids, [
      'tid', 'cid', 'deleted', 'title', 'uid', 'mainPid', 'timestamp'
    ]) as Topic[]
    const tidToTopic: _.Dictionary<Topic> = _.zipObject(tids, topicData)

    const mainPosts = postData.filter(p => p.pid === tidToTopic[p.tid].mainPid)
    if (mainPosts.length === 0) {
      return
    }

    const bulkAdd: (string | number)[][] = []
    const bulkRemove: (string | number)[][] = []
    const postsByUser: { [key: string]: PostData[] } = { }
    mainPosts.forEach((post) => {
      bulkRemove.push([`cid:${post.cid}:uid:${post.uid}:tids`, post.tid])
      bulkRemove.push([`uid:${post.uid}:topics`, post.tid])

      bulkAdd.push([`cid:${post.cid}:uid:${toUid}:tids`, tidToTopic[post.tid].timestamp, post.tid])
      bulkAdd.push([`uid:${toUid}:topics`, tidToTopic[post.tid].timestamp, post.tid])
      postsByUser[post.uid] = postsByUser[post.uid] || []
      postsByUser[post.uid].push(post)
    })

    await Promise.all([
      // The next few lines call a function in a module that has not been updated to TS yet
      /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
      db.setObjectField(mainPosts.map(p => `topic:${p.tid}`), 'uid', toUid),
      db.sortedSetRemoveBulk(bulkRemove),
      db.sortedSetAddBulk(bulkAdd),
      user.incrementUserFieldBy(toUid, 'topiccount', mainPosts.length),
      /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
      reduceTopicCounts(postsByUser)
    ])

    const changedTopics = mainPosts.map(p => tidToTopic[p.tid])
    await plugins.hooks.fire('action:topic.changeOwner', {
      topics: _.cloneDeep(changedTopics),
      toUid
    })
  }

  Posts.changeOwner = async function (pids: number[], toUid: string) {
    const exists: boolean = await user.exists(toUid) as boolean
    if (!exists) {
      throw new Error('[[error:no-user]]')
    }
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    let postData: PostData[] = await Posts.getPostsFields(pids, [
      'pid', 'tid', 'uid', 'content', 'deleted', 'timestamp', 'upvotes', 'downvotes'
    ])
    postData = postData.filter(p => p.pid && parseInt(p.uid, 10) !== parseInt(toUid, 10))
    pids = postData.map(p => p.pid)
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const cids: number[] = await Posts.getCidsByPids(pids)

    const bulkRemove: (string | number)[][] = []
    const bulkAdd: (string | number)[][] = []
    let repChange = 0
    const postsByUser: { [key: string]: PostData[] } = {}
    postData.forEach((post, i) => {
      post.cid = cids[i]
      repChange += post.votes
      bulkRemove.push([`uid:${post.uid}:posts`, post.pid])
      bulkRemove.push([`cid:${post.cid}:uid:${post.uid}:pids`, post.pid])
      bulkRemove.push([`cid:${post.cid}:uid:${post.uid}:pids:votes`, post.pid])

      bulkAdd.push([`uid:${toUid}:posts`, post.timestamp, post.pid])
      bulkAdd.push([`cid:${post.cid}:uid:${toUid}:pids`, post.timestamp, post.pid])
      if (post.votes > 0 || post.votes < 0) {
        bulkAdd.push([`cid:${post.cid}:uid:${toUid}:pids:votes`, post.votes, post.pid])
      }
      postsByUser[post.uid] = postsByUser[post.uid] || []
      postsByUser[post.uid].push(post)
    })

    // The next few lines call a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      db.setObjectField(pids.map(pid => `post:${pid}`), 'uid', toUid),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      db.sortedSetRemoveBulk(bulkRemove),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      db.sortedSetAddBulk(bulkAdd),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      user.incrementUserReputationBy(toUid, repChange),
      handleMainPidOwnerChange(postData, toUid),
      updateTopicPosters(postData, toUid)
    ])

    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      user.updatePostCount(toUid),
      reduceCounters(postsByUser)
    ])

    await plugins.hooks.fire('action:post.changeOwner', {
      posts: _.cloneDeep(postData),
      toUid
    })
    return postData
  }
}
