let dependencies = {};

const setDependencies = app => {
	dependencies.lodash = app.require('lodash');
	dependencies.aws = app.require('aws-sdk');
};

module.exports = {
	setDependencies,
	dependencies,
};
