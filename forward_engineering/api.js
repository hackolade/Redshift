'use strict';

const applyToInstanceHelper = require('./helpers/applyToInstanceHelper');
const { commentDropStatements } = require('./helpers/commentDropStatements');
const { DROP_STATEMENTS } = require('./helpers/constants');

module.exports = {
	generateScript(data, logger, callback, app) {
		try {
			logger.clear();
			const {
				getAlterContainersScripts,
				getAlterCollectionsScripts,
				getAlterViewScripts,
			} = require('./helpers/alterScriptFromDeltaHelper');

			const collection = JSON.parse(data.jsonSchema);
			if (!collection) {
				throw new Error(
					'"comparisonModelCollection" is not found. Alter script can be generated only from Delta model',
				);
			}

			const containersScripts = getAlterContainersScripts(collection, app);
			const collectionsScripts = getAlterCollectionsScripts(collection, app);
			const viewScripts = getAlterViewScripts(collection, app);
			const script = [...containersScripts, ...collectionsScripts, ...viewScripts].join('\n\n');

			const applyDropStatements = data.options?.additionalOptions?.some(
				option => option.id === 'applyDropStatements' && option.value,
			);

			callback(null, applyDropStatements ? script : commentDropStatements(script));
		} catch (error) {
			logger.log('error', { message: error.message, stack: error.stack }, 'Redshift Forward-Engineering Error');

			callback({ message: error.message, stack: error.stack });
		}
	},

	generateContainerScript(data, logger, callback, app) {
		try {
			data.jsonSchema = data.collections[0];
			this.generateScript(data, logger, callback, app);
		} catch (error) {
			logger.log('error', { message: error.message, stack: error.stack }, 'Redshift Forward-Engineering Error');

			callback({ message: error.message, stack: error.stack });
		}
	},

	applyToInstance(connectionInfo, logger, cb, app) {
		logger.clear();
		logger.log('info', connectionInfo, 'connectionInfo', connectionInfo.hiddenKeys);

		applyToInstanceHelper
			.applyToInstance(connectionInfo, logger, app)
			.then(result => {
				cb(null, result);
			})
			.catch(error => {
				logger.log('error', { error }, 'Apply to instance error');
				cb({ message: error.message });
			});
	},

	async testConnection(connectionInfo, logger, cb, app) {
		this.logInfo('Test connection', connectionInfo, logger);
		try {
			await applyToInstanceHelper.testConnection(connectionInfo, logger, app);
			cb();
		} catch (err) {
			this.handleError(logger, err, cb);
		}
	},

	handleError(logger, error, cb) {
		const message = _.isString(error) ? error : _.get(error, 'message', 'Forvard Engineering error');
		logger.log('error', { error }, 'Forvard Engineering error');
		cb(message);
	},

	logInfo(step, connectionInfo, logger) {
		logger.clear();
		logger.log('info', connectionInfo, 'connectionInfo', connectionInfo.hiddenKeys);
	},

	isDropInStatements(data, logger, callback, app) {
		try {
			const cb = (error, script = '') =>
				callback(
					error,
					DROP_STATEMENTS.some(statement => script.includes(statement)),
				);

			if (data.level === 'container') {
				this.generateContainerScript(data, logger, cb, app);
			} else {
				this.generateScript(data, logger, cb, app);
			}
		} catch (e) {
			callback({ message: e.message, stack: e.stack });
		}
	},
};
