let dependencies = {};

const setDependencies = app => {
	dependencies.lodash = app.require('lodash');
	dependencies.aws = {
		redshift: require("@aws-sdk/client-redshift"),
		redshiftData: require("@aws-sdk/client-redshift-data"),
		redshiftLess: require("@aws-sdk/client-redshift-serverless")
	};
};

module.exports = {
	setDependencies,
	dependencies,
};
