'use strict';

const redshiftHelper = require('./helpers/redshiftHelper');
const { setDependencies, dependencies } = require('./helpers/appDependencies');
let _;

const connect = async (connectionInfo, logger, cb, app) => {
	initDependencies(app);
	logger.clear();
	logger.log('info', connectionInfo, 'connectionInfo', connectionInfo.hiddenKeys);
	try{
		await redshiftHelper.connect(connectionInfo,logger);
	} catch (err){
		handleError(logger, err, cb);
	}
};

const disconnect = async (connectionInfo, logger, cb) => {
	cb();
};

const testConnection = async (connectionInfo, logger, cb, app) => {
	initDependencies(app);
	try{
		logger.clear();
		logger.log('info', connectionInfo, 'connectionInfo', connectionInfo.hiddenKeys);
		await redshiftHelper.testConnection(connectionInfo, logger);
		cb();
	}catch(err){
		handleError(logger, err, cb);
	}
};

const getDbCollectionsNames = async (connectionInfo, loggerInstance, cb, app) => {
	const logger = createLogger('Retrieving databases and tables information', loggerInstance);
	await connect(connectionInfo, loggerInstance, cb, app);
	try {
		const redshiftSchemaNames = await redshiftHelper.getSchemaNames();
		logger.info(`Schema names: ${JSON.stringify(redshiftSchemaNames)}`);
		const dbCollectionNamePromises = redshiftSchemaNames.map((schemaName) => redshiftHelper.getSchemaCollectionNames(schemaName, logger));
		const dbCollectionNames = await Promise.all(dbCollectionNamePromises)
		cb(null, dbCollectionNames);
	} catch (err) {
		logger.error(err);
		cb({ message: err.message, stack: err.stack });
	}
};

const getDbCollectionsData = async (data, loggerInstance, cb, app) => {
	const async = app.require('async');
	const logger = createLogger('Getting data for creation schema', loggerInstance);
	try {
		const collections = data.collectionData.collections;
		const dataBaseNames = data.collectionData.dataBaseNames;

		logger.info(`Selected entities: ${JSON.stringify(collections, null, 4)}`);

		logger.info('Getting cluster information');
		const modelData = await redshiftHelper.getModelData()

		const packages = await dataBaseNames.reduce(async (packagesPromise, schema) => {
			const packages = await packagesPromise;
			const entities = redshiftHelper.splitTableAndViewNames(collections[schema]);

			logger.info(`Getting schema information: ${schema}`);
			const containerData = await redshiftHelper.getContainerData(schema);

			const tablesPackages = await mapItems(async, entities.tables, 100, async (table) => {
				const fullTableName = `"${schema}"."${table}"`;

				logger.info(`Start getting data from table: "${schema}"."${table}"`);
				logger.progress({ message: `Start getting data from table`, containerName: schema, entityName: table });
				
				logger.info(`Getting DDL: "${schema}"."${table}"`);
				const ddl = await redshiftHelper.getTableDDL(schema,table);
				
				logger.info(`Getting documents: "${schema}"."${table}"`);
				const quantity = await redshiftHelper.getRowsCount(fullTableName);
				logger.info(`Found ${quantity} documents: "${schema}"."${table}"`);
				const documents = await redshiftHelper.getDocuments(schema, table, quantity, data.recordSamplingSettings);

				logger.info(`Fetching record for JSON schema inference: "${schema}"."${table}"`);
				logger.progress({ message: `Fetching record for JSON schema inference`, containerName: schema, entityName: table });
				const jsonSchema = await redshiftHelper.getJsonSchema(documents, schema, table);

				logger.info(`Schema inference: "${schema}"."${table}"`);
				logger.progress({ message: `Schema inference`, containerName: schema, entityName: table });
				const handledDocuments = redshiftHelper.handleComplexTypesDocuments(jsonSchema, documents);

				logger.info(`Data retrieved successfully: "${schema}"."${table}"`);
				logger.progress({ message: `Data retrieved successfully`, containerName: schema, entityName: table });

				return {
					dbName: schema,
					collectionName: table,
					entityLevel: {},
					documents: handledDocuments,
					views: [],
					ddl: {
						script: ddl,
						type: 'redshift',
						takeAllDdlProperties: true
					},
					emptyBucket: false,
					validation: {
						jsonSchema:{properties:{}}
					},
					bucketInfo: {
						...containerData
					},
				};
			});

			const views = await mapItems(async, entities.views, 100, async view => {
				logger.info(`Start getting data from view: "${schema}"."${view}"`);
				logger.progress({ message: `Start getting data from view`, containerName: schema, entityName: view });
			
				logger.info(`Get view DDL: "${schema}"."${view}"`);
				const ddl = await redshiftHelper.getViewDDL(schema, view);
			
				logger.info(`Get view description: "${schema}"."${view}"`);
				const description = await redshiftHelper.getViewDescription(view);

				logger.info(`Data retrieved successfully: "${schema}"."${view}"`);
				logger.progress({ message: `Data retrieved successfully`, containerName: schema, entityName: view });

				return {
					name: view,
					data: {
						description,
					},
					ddl: {
						script: ddl,
						type: 'redshift',
					},
				};
			});

			if (_.isEmpty(views)) {
				return [ ...packages, ...tablesPackages ];
			}

			const viewPackage = {
				dbName: schema,
				entityLevel: {},
				views,
				emptyBucket: false,
				bucketInfo: {
					...containerData
				},
			};

			return [ ...packages, ...tablesPackages, viewPackage ];
		}, Promise.resolve([]))

		cb(null, packages.filter(Boolean), modelData);
	} catch (err) {
		err = logger.error(err);

		cb(err);
	}
};

const handleError = (logger, error, cb) => {
	const message = _.isString(error) ? error : _.get(error, 'message', 'Reverse Engineering error')
	logger.log('error', { error }, 'Reverse Engineering error');
	cb(message);
};

const initDependencies = app => {
	setDependencies(app);
	_ = dependencies.lodash;
	redshiftHelper.setDependencies(dependencies);
};

const createLogger = (title, logger) => {
	return {
		clear() {
			logger.clear();
		},
		info(message) {
			logger.log('info', { message }, title);
		},
		error(error) {
			if (typeof error === 'string') {
				error = new Error(error);
			}
			error = { message: error.message, stack: error.stack, error };
			logger.log('error', error, title);
		},
		progress(data) {
			logger.progress(data);
		},
	};
};

const mapItems = (async, items, limit, iteratee) => new Promise((resolve, reject) => {
	async.mapLimit(items, limit, (item, callback) => {
		const promise = iteratee(item);

		promise.then(
			(result) => callback(null, result),
			(error) => callback(error),
		);
	}, (error, result) => {
		if (error) {
			return reject(error);
		} else {
			return resolve(result);
		}
	});
});

module.exports = {
	connect,
	disconnect,
	testConnection,
	getDbCollectionsNames,
	getDbCollectionsData
}