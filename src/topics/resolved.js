"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const db = require("../database");
module.exports = function (Topics) {
    Topics.setResolved = function (tid) {
        return __awaiter(this, void 0, void 0, function* () {
            let resolved;
            // 313: These type checks are done because redis saves the object field as a string
            // vs everything else saves it as a boolean.
            // The next lines calls a function in a module that has not been updated to TS yet
            /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
            if (typeof (yield db.getObjectField(`topic:${tid}`, 'resolved')) === 'string') {
                resolved = (yield db.getObjectField(`topic:${tid}`, 'resolved')) === 'true';
            }
            else if (typeof (yield db.getObjectField(`topic:${tid}`, 'resolved')) === 'boolean') {
                resolved = (yield db.getObjectField(`topic:${tid}`, 'resolved'));
            }
            /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            yield db.setObjectField(`topic:${tid}`, 'resolved', !resolved);
        });
    };
};
