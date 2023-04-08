'use strict';

const router = require('express').Router();
const middleware = require('../../middleware');
const controllers = require('../../controllers');
const career = require('../../controllers/write/career');

const routeHelpers = require('../helpers');

const { setupApiRoute } = routeHelpers;

module.exports = function () {
    const middlewares = [middleware.ensureLoggedIn];

    setupApiRoute(router, 'post', '/', [...middlewares], career.register);

    return router;
};
