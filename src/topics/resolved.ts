import db = require('../database');

export = function (Topics: { setResolved?: (tid: number) => Promise<void>; }) {
    Topics.setResolved = async function (tid: number): Promise<void> {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const resolved: boolean = (await db.getObjectField(`topic:${tid}`, 'resolved') as string) === 'true';
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await db.setObjectField(`topic:${tid}`, 'resolved', !resolved);
    };
};
