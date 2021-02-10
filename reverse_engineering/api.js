'use strict';

const redshiftHelper = require('./helpers/redshiftHelper');
const aws = require('aws-sdk');
const { setDependencies, dependencies } = require('./helpers/appDependencies');
let _;

this.redshift = null;

const connect = async (connectionInfo, logger, cb, app) => {
	initDependencies(app);
	const { accessKeyId, secretAccessKey, region } = connectionInfo;
	aws.config.update({ accessKeyId, secretAccessKey, region, maxRetries: 5 });
	const redshiftInstance = new aws.Redshift({ apiVersion: '2012-12-01' });
	const redshiftDataInstance = new aws.RedshiftData({ apiVersion: '2019-12-20' });
	try {
		const clusters = await redshiftInstance.describeClusters().promise();
		const requiredCluster = clusters.Clusters.find(cluster => cluster.ClusterIdentifier === connectionInfo.clusterIdentifier);
		if (!requiredCluster) {
			throw new Error(`Cluster with '${connectionInfo.clusterIdentifier}' identifier was not found`)
		}
		const connectionParams = {
			ClusterIdentifier: requiredCluster.ClusterIdentifier,
			Database: connectionInfo.databaseName.toLowerCase(),
			DbUser: requiredCluster.MasterUsername
		}
		this.redshift = { redshiftInstance, redshiftDataInstance, connectionParams };
		redshiftHelper.setRedshift(this.redshift);
	} catch (err) {
		logger.log('error', { message: err.message, stack: err.stack, error: err }, `Connection failed`);
		cb(err, {});
	}
};

const disconnect = async (connectionInfo, logger, cb) => {
	cb();
};

const testConnection = async (connectionInfo, logger, cb, app) => {
	logInfo('Test connection', connectionInfo, logger);
	await connect(connectionInfo, logger, cb, app);
	if(this.redshift){
		try {
			await this.redshift.redshiftDataInstance.listTables({...this.redshift.connectionParams}).promise();
			cb();
		} catch (err) {
			logger.log('error', { message: err.message, stack: err.stack, error: err }, 'Connection failed');
			cb(err);
		}	
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
		const entitiesPromises = await dataBaseNames.reduce(async(packagesPromise, schema) => {
			const packages = await packagesPromise;
			const entities = redshiftHelper.splitTableAndViewNames(collections[schema]);
			const containerData = await redshiftHelper.getContainerData(schema);



			const tablesPackages = entities.tables.map(async (table) => {
				logger.progress({ message: `Start getting data from table`, containerName: schema, entityName: table });
				const ddl = await redshiftHelper.getTableDDL(schema,table);
				logger.progress({ message: `Fetching record for JSON schema inference`, containerName: schema, entityName: table });
				logger.progress({ message: `Schema inference`, containerName: schema, entityName: table });
				//TODO: add handling for complex type documents
				logger.progress({ message: `Data retrieved successfully`, containerName: schema, entityName: table });
				return {
					dbName: schema,
					collectionName: table,
					entityLevel: {},
					documents: [],
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
				const viewData = await redshiftHelper.getViewData(view);

				logger.progress({ message: `Data retrieved successfully`, containerName: schema, entityName: view });

				return {
					name: view,
					data: viewData || {},
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
		cb(null, packages.filter(Boolean));
	} catch (err) {
		handleError(logger, err, cb);
	}
};

const handleError = (logger, error, cb) => {
	debugger
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