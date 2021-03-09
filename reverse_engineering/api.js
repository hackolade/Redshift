'use strict';

const redshiftHelper = require('./helpers/redshiftHelper');
const { setDependencies, dependencies } = require('./helpers/appDependencies');
let _;

const connect = async (connectionInfo, logger, cb, app) => {
	initDependencies(app);
	logger.clear();
	logger.log('info', connectionInfo);
	try{
		await redshiftHelper.connect(connectionInfo);
	}catch(err){
		handleError(logger, err, cb);
	}
};

const disconnect = async (connectionInfo, logger, cb) => {
	cb();
};

const testConnection = async (connectionInfo, logger, cb, app) => {
	initDependencies(app);
	logInfo('Test connection', connectionInfo, logger);
	try{
		await redshiftHelper.testConnection(connectionInfo,logger);
		cb();
	}catch(err){
		handleError(logger, err, cb);
	}
};

const getDatabases = (connectionInfo, logger, cb) => {
	cb();
};

const getDocumentKinds = (connectionInfo, logger, cb) => {
	cb();
};

const getDbCollectionsNames = async (connectionInfo, logger, cb, app) => {
	await connect(connectionInfo, logger, cb, app);
	try {
		const redshiftSchemaNames = await redshiftHelper.getSchemaNames()
		const dbCollectionNamePromises = redshiftSchemaNames.reduce((dbCollectionNames, schemaName) =>
			dbCollectionNames.concat(redshiftHelper.getSchemaCollectionNames(schemaName)), []);
		const dbCollectionNames = await Promise.all(dbCollectionNamePromises)
		cb(null, dbCollectionNames);
	} catch (err) {
		logger.log(
			'error',
			{ message: err.message, stack: err.stack, error: err },
			'Retrieving databases and tables information'
		);
		cb({ message: err.message, stack: err.stack });
	}
};

const getDbCollectionsData = async (data, logger, cb, app) => {
	try {
		const collections = data.collectionData.collections;
		const dataBaseNames = data.collectionData.dataBaseNames;

		const modelData = await redshiftHelper.getModelData()

		const entitiesPromises = await dataBaseNames.reduce(async(packagesPromise, schema) => {
			const packages = await packagesPromise;
			const entities = redshiftHelper.splitTableAndViewNames(collections[schema]);
			const containerData = await redshiftHelper.getContainerData(schema);
			const tablesPackages = entities.tables.map(async (table) => {
				const fullTableName = `"${schema}"."${table}"`
				logger.progress({ message: `Start getting data from table`, containerName: schema, entityName: table });
				const ddl = await redshiftHelper.getTableDDL(schema,table);
				const quantity = await redshiftHelper.getRowsCount(fullTableName);
				const documents = await redshiftHelper.getDocuments(schema, table, quantity, data.recordSamplingSettings);

				logger.progress({ message: `Fetching record for JSON schema inference`, containerName: schema, entityName: table });
				const jsonSchema = await redshiftHelper.getJsonSchema(documents, schema, table);
				logger.progress({ message: `Schema inference`, containerName: schema, entityName: table });

				const handledDocuments = redshiftHelper.handleComplexTypesDocuments(jsonSchema, documents);

				logger.progress({ message: `Data retrieved successfully`, containerName: schema, entityName: table });
				return {
					dbName: schema,
					collectionName: table,
					entityLevel: {},
					documents: handledDocuments,
					views: [],
					ddl: {
						script: ddl,
						type: 'redshift'
					},
					emptyBucket: false,
					validation: {
						jsonSchema:{properties:{}}
					},
					bucketInfo: {
						...containerData
					}
				};
			});

			const views = await Promise.all(entities.views.map(async view => {
				logger.progress({ message: `Start getting data from view`, containerName: schema, entityName: view });
				const ddl = await redshiftHelper.getViewDDL(schema,view);

				logger.progress({ message: `Data retrieved successfully`, containerName: schema, entityName: view });

				return {
					name: view,
					data: {},
					ddl: {
						script: ddl,
						type: 'redshift'
					}
				};
			}));

			if (_.isEmpty(views)) {
				return [ ...packages, ...tablesPackages ];
			}

			const viewPackage = Promise.resolve({
				dbName: schema,
				entityLevel: {},
				views,
				emptyBucket: false,
				bucketInfo: {
					...containerData
				}
			});

			return [ ...packages, ...tablesPackages, viewPackage ];
		}, Promise.resolve([]))
		const packages = await Promise.all(entitiesPromises);
		cb(null, packages.filter(Boolean),modelData);
	} catch (err) {
		handleError(logger, err, cb);
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

const logInfo = (step, connectionInfo, logger) => {
	logger.clear();
	logger.log('info', connectionInfo, 'connectionInfo', connectionInfo.hiddenKeys);
};

module.exports = {
	connect,
	disconnect,
	testConnection,
	getDatabases,
	getDocumentKinds,
	getDbCollectionsNames,
	getDbCollectionsData
}