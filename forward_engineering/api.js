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
				cb({message: error.message });
			});
	},

	async testConnection(connectionInfo, logger, cb, app) {
		this.logInfo('Test connection', connectionInfo, logger);
        try{
			await applyToInstanceHelper.testConnection(connectionInfo,logger);
            cb();
        }catch(err){
            this.handleError(logger, err, cb);
        }
	},

    handleError (logger, error, cb) {
		const message = _.isString(error) ? error : _.get(error, 'message', 'Forvard Engineering error')
		logger.log('error', { error }, 'Forvard Engineering error');
		cb(message);
	},

	logInfo(step, connectionInfo, logger){
		logger.clear();
		logger.log('info', connectionInfo, 'connectionInfo', connectionInfo.hiddenKeys);
	}
};
