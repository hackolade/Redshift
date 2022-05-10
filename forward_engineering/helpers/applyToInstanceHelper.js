const redshiftHelper = require('../../reverse_engineering/helpers/redshiftHelper');

module.exports = {
	async applyToInstance(connectionInfo, logger, app) {
		const script = connectionInfo.script;
		redshiftHelper.setDependencies({ lodash: app.require('lodash'), aws: app.require('aws-sdk') });
		await redshiftHelper.connect(connectionInfo, logger);

		logger.log(
			'info',
			{
				message: 'Applying redshift script has been started',
			},
			'Redshift script',
		);

		await redshiftHelper.executeApplyToInstanceScript(script);
	},

	async testConnection(connectionInfo, logger, app) {
        redshiftHelper.setDependencies({ lodash: app.require('lodash'), aws: app.require('aws-sdk') });

		await redshiftHelper.testConnection(connectionInfo, logger);
	},
};
