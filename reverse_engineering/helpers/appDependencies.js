const redshift = require('@aws-sdk/client-redshift');
const redshiftData = require('@aws-sdk/client-redshift-data');
const redshiftLess = require('@aws-sdk/client-redshift-serverless');

let dependencies = {};

const setDependencies = app => {
	dependencies.lodash = app.require('lodash');
	dependencies.aws = {
		redshift,
		redshiftData,
		redshiftLess,
	};
};

module.exports = {
	setDependencies,
	dependencies,
	redshift,
	redshiftData,
	redshiftLess,
};
