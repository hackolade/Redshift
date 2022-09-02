const redshiftHelper = require('../../reverse_engineering/helpers/redshiftHelper');
const { setDependencies, dependencies } = require('../../reverse_engineering/helpers/appDependencies');

module.exports = {
	async applyToInstance(connectionInfo, logger, app) {
		const script = connectionInfo.script;
		setDependencies(app);
		redshiftHelper.setDependencies(dependencies);
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
		setDependencies(app);
		redshiftHelper.setDependencies(dependencies);

		await redshiftHelper.testConnection(connectionInfo, logger);
	},
};
