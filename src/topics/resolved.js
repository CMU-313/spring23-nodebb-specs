"use strict";
const db = require("../database");
module.exports = function (Topics) {
    Topics.setResolved = async function (tid) {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const resolved = await db.getObjectField(`topic:${tid}`, 'resolved') === 'true';
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await db.setObjectField(`topic:${tid}`, 'resolved', !resolved);
    };
};
