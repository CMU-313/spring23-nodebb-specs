import db = require('../database');

export = function (Topics: { setResolved?: (tid: number) => Promise<void>; }) {
    Topics.setResolved = async function (tid: number): Promise<void> {
        let resolved: boolean;
        // The next lines calls a function in a module that has not been updated to TS yet
        /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
        if (typeof await db.getObjectField(`topic:${tid}`, 'resolved') === 'string') {
            resolved = (await db.getObjectField(`topic:${tid}`, 'resolved') as string) === 'true';
        } else if (typeof await db.getObjectField(`topic:${tid}`, 'resolved') === 'boolean') {
            resolved = await db.getObjectField(`topic:${tid}`, 'resolved') as boolean;
        }
        /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await db.setObjectField(`topic:${tid}`, 'resolved', !resolved);
    };
};
