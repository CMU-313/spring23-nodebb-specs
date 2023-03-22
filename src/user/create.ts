import zxcvbn from 'zxcvbn'
import winston from 'winston'

import db from '../database'
import utils from '../utils'
import slugify from '../slugify'
import plugins from '../plugins'
import groups from '../groups'
import meta from '../meta'
import analytics from '../analytics'

import user from '.'

interface Data {
  username: string
  userslug: string
  accounttype: string
  email: string
  joindate: number
  lastonline: number
  status: string
  gdpr_consent?: boolean | number
  acceptTos: boolean
  uid: number
  fullname: string
  password: string
  timestamp: number
}

interface UserData {
  username: string
  userslug: string
  accounttype: string
  email: string
  joindate: number
  lastonline: number
  status: string
  gdpr_consent?: boolean
  acceptTos: number
  uid: number
  fullname: string
  password: string
}

interface Result {
  user: UserData
  data: Data
}

interface TheUser {
  create: (data: Data) => Promise<number>
  isDataValid: (userData: Data) => Promise<void>
  isPasswordValid: (password: string, minStrength?: number) => void
  uniqueUsername: (userData: UserData) => Promise<string | null>
}

export = function (User: TheUser) {
  async function lock (value: string, error: string): Promise<void> {
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const count: number = await db.incrObjectField('locks', value) as number
    if (count > 1) {
      throw new Error(error)
    }
  }

  async function storePassword (uid: number, password: string): Promise<void> {
    if (typeof password === 'string' && password.length === 0) {
      return
    }
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const hash: number = await user.hashPassword(password) as number
    await Promise.all([
      // The next line calls a function in a module that has not been updated to TS yet
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      user.setUserFields(uid, {
        password: hash,
        'password:shaWrapped': 1
      }),
      user.reset.updateExpiry(uid)
    ])
  }

  async function create (data: Data): Promise<number> {
    const timestamp: number = data.timestamp !== 0 ? data.timestamp : Date.now()
    const inAccType = (data['account-type'] as string)

    let userData: UserData = {
      username: data.username,
      userslug: data.userslug,
      accounttype: typeof inAccType === 'string' && inAccType.length !== 0 ? inAccType : 'student',
      email: typeof data.email === 'string' && data.email.length !== 0 ? data.email : '',
      joindate: timestamp,
      lastonline: timestamp,
      status: 'online',
      acceptTos: 0,
      uid: 0,
      fullname: '',
      password: ''
    };
    ['picture', 'fullname', 'location', 'birthday'].forEach((field) => {
      if (data[field] !== null && data[field] !== undefined) {
        userData[field] = data[field] as string
      }
    })
    if (data.gdpr_consent === true || data.gdpr_consent === 1) {
      userData.gdpr_consent = true
    }
    if (data.acceptTos) {
      userData.acceptTos = 1
    }

    const renamedUsername: string = await User.uniqueUsername(userData) as string
    const userNameChanged = Boolean(renamedUsername) // is this same as !! ?
    if (userNameChanged) {
      userData.username = renamedUsername
      userData.userslug = slugify(renamedUsername) as string
    }

    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    const results: Result = await plugins.hooks.fire('filter:user.create', { user: userData, data }) as Result
    userData = results.user

    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const uid: number = await db.incrObjectField('global', 'nextUid') as number
    const isFirstUser: boolean = uid === 1
    userData.uid = uid
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    await db.setObject(`user:${uid}`, userData)

    const bulkAdd = [
      ['username:uid', userData.uid, userData.username],
      [`user:${userData.uid}:usernames`, timestamp, `${userData.username}:${timestamp}`],
      ['accounttype:uid', userData.uid, userData.accounttype],
      ['username:sorted', 0, `${userData.username.toLowerCase()}:${userData.uid}`],
      ['userslug:uid', userData.uid, userData.userslug],
      ['users:joindate', timestamp, userData.uid],
      ['users:online', timestamp, userData.uid],
      ['users:postcount', 0, userData.uid],
      ['users:reputation', 0, userData.uid]
    ]

    if (userData.fullname !== null && userData.fullname !== undefined && userData.fullname.length > 0) {
      bulkAdd.push(['fullname:sorted', 0, `${userData.fullname.toLowerCase()}:${userData.uid}`])
    }

    await Promise.all([
      /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
      db.incrObjectField('global', 'userCount'),
      analytics.increment('registrations'),
      db.sortedSetAddBulk(bulkAdd),
      groups.join(['registered-users', 'unverified-users'], userData.uid),
      user.notifications.sendWelcomeNotification(userData.uid),
      storePassword(userData.uid, data.password),
      user.updateDigestSetting(userData.uid, meta.config.dailyDigestFreq)
      /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
    ])

    if (userData.email !== null && userData.email !== undefined &&
      userData.email.length > 0 && isFirstUser) {
      await user.email.confirmByUid(userData.uid)
    }

    if (userData.email !== null && userData.email !== undefined &&
      userData.email.length > 0 && userData.uid > 1) {
      await user.email.sendValidationEmail(userData.uid, {
        email: userData.email,
        template: 'welcome',
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,@typescript-eslint/strict-boolean-expressions
        subject: `[[email:welcome-to, ${(meta.config.title as string) || (meta.config.browserTitle as string) || 'NodeBB'}]]`
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
      }).catch(err => winston.error(`[user.create] Validation email failed to send\n[emailer.send] ${err.stack as string}`))
    }
    if (userNameChanged) {
      await user.notifications.sendNameChangeNotification(userData.uid, userData.username)
    }
    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    await plugins.hooks.fire('action:user.create', { user: userData, data })
    return userData.uid
  }

  User.create = async function (data: Data): Promise<number> {
    data.username = data.username.trim()
    data.userslug = slugify(data.username) as string
    if (data.email !== undefined) {
      data.email = String(data.email).trim()
    }
    if (data['account-type'] !== undefined && data['account-type'] !== null) {
      data['account-type'] = (data['account-type'] as string).trim()
    }

    await User.isDataValid(data)

    await lock(data.username, '[[error:username-taken]]')
    if (data.email !== null && data.email !== undefined && data.email !== data.username) {
      await lock(data.email, '[[error:email-taken]]')
    }

    try {
      return await create(data)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,@typescript-eslint/strict-boolean-expressions
      await db.deleteObjectFields('locks', [data.username, data.email])
    }
  }

  User.isDataValid = async function (userData: Data): Promise<void> {
    if (userData.email !== null && userData.email !== undefined && !(utils.isEmailValid(userData.email) as boolean)) {
      throw new Error('[[error:invalid-email]]')
    }

    if (!(utils.isUserNameValid(userData.username) as boolean) ||
      userData.userslug === null || userData.userslug === undefined ||
      userData.userslug.length <= 0) {
      throw new Error(`[[error:invalid-username, ${userData.username}]]`)
    }

    if (userData.password !== null && userData.password !== undefined) {
      User.isPasswordValid(userData.password)
    }

    if (userData.email !== null && userData.email !== undefined) {
      const available = await user.email.available(userData.email)
      if (!available) {
        throw new Error('[[error:email-taken]]')
      }
    }
  }

  User.isPasswordValid = function (password: string, minStrength?: number): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
    minStrength = minStrength ?? (meta.config.minimumPasswordStrength as number)

    // Sanity checks: Checks if defined and is string
    if (password === null || password === undefined ||
      password.length <= 0 || !(utils.isPasswordValid(password) as boolean)) {
      throw new Error('[[error:invalid-password]]')
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
    if (password.length < meta.config.minimumPasswordLength) {
      throw new Error('[[reset_password:password_too_short]]')
    }

    if (password.length > 512) {
      throw new Error('[[error:password-too-long]]')
    }

    // The next line calls a function in a module that has not been updated to TS yet
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const strength: { score: number } = zxcvbn(password)
    if (strength.score < minStrength) {
      throw new Error('[[user:weak_password]]')
    }
  }

  User.uniqueUsername = async function (userData: UserData): Promise<string | null> {
    let numTries = 0
    let { username } = userData
    while (true) {
      // The next line calls a function in a module that has not been updated to TS yet
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, no-await-in-loop */
      const exists: boolean = await meta.userOrGroupExists(username)
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, no-await-in-loop */
      if (!exists) {
        return numTries === 0 ? username : null
      }
      username = `${userData.username} ${numTries.toString(32)}`
      numTries += 1
    }
  }
}
