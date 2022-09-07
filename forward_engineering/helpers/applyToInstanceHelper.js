const redshiftHelper = require('../../reverse_engineering/helpers/redshiftHelper');
const { redshift, redshiftData, redshiftLess } = require('../../reverse_engineering/helpers/appDependencies');

const setDependencies = app => {
	redshiftHelper.setDependencies({
		lodash: app.require('lodash'), 
		aws: {
			redshift,
			redshiftData,
			redshiftLess,
		}
	});
};

module.exports = {
	async applyToInstance(connectionInfo, logger, app) {
		const script = connectionInfo.script;
		setDependencies(app);

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

		await redshiftHelper.testConnection(connectionInfo, logger);
	},
};
