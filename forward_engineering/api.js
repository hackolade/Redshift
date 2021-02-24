'use strict'

const applyToInstanceHelper = require('./helpers/applyToInstanceHelper')


module.exports = {
	generateScript(data, logger, cb) {
		cb(null, '');
	},

	generateContainerScript(data, logger, cb) {
		cb(null, '');
	},

	applyToInstance(connectionInfo, logger, cb, app) {
		logger.clear();
		logger.log('info', connectionInfo, 'connectionInfo', connectionInfo.hiddenKeys);

		applyToInstanceHelper.applyToInstance(connectionInfo, logger)
			.then(result => {
				cb(null, result);
			})
			.catch(error => {
				logger.log('error', { error}, 'Apply to instance error');
				cb({message: error.message },);
			});
	},
};
