"use strict";
const db = require("../database");
module.exports = function (Topics) {
    Topics.setResolved = async function (tid) {
        let resolved;
        // 313: These type checks are done because redis saves the object field as a string
        // vs everything else saves it as a boolean.
        // The next lines calls a function in a module that has not been updated to TS yet
        /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
        if (typeof await db.getObjectField(`topic:${tid}`, 'resolved') === 'string') {
            resolved = await db.getObjectField(`topic:${tid}`, 'resolved') === 'true';
        }
        else if (typeof await db.getObjectField(`topic:${tid}`, 'resolved') === 'boolean') {
            resolved = await db.getObjectField(`topic:${tid}`, 'resolved');
        }
        else {
            throw new Error('[[error:invalid-data]]');
        }
        /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await db.setObjectField(`topic:${tid}`, 'resolved', !resolved);
    };
};
