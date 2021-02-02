'use strict';

const snowflakeHelper = require('./helpers/snowflakeHelper');
const aws = require('aws-sdk');
const { setDependencies, dependencies } = require('./helpers/appDependencies');
let _;

this.redshift = null;

const connect = async (connectionInfo, logger, cb, app) => {
	initDependencies(app);
	const { accessKeyId, secretAccessKey, region } = connectionInfo;
	aws.config.update({ accessKeyId, secretAccessKey, region });

	const redshiftInstance = new aws.Redshift({apiVersion: '2012-12-01'});
	const redshiftDataInstance = new aws.RedshiftData({apiVersion: '2019-12-20'});
	
	try{
		const clusters = await redshiftInstance.describeClusters().promise();
		const requiredCluster = clusters.Clusters.find(cluster => cluster.ClusterIdentifier === connectionInfo.clusterIdentifier);
		if(!requiredCluster){
			throw new Error(`Cluster with '${connectionInfo.clusterIdentifier}' identifier was not found`)
		}
		const connectionParams  = {
			ClusterIdentifier: requiredCluster.ClusterIdentifier,
			Database: requiredCluster.DBName,
			DbUser: requiredCluster.MasterUsername
		}
		this.redshift = {redshiftInstance, redshiftDataInstance, connectionParams}
		cb(null, {redshiftInstance, redshiftDataInstance, connectionParams});
	}catch(err){
		logger.log('error', { message: err.message, stack: err.stack, error: err }, `Connection failed`);
		cb(err,{});
	}
};

const disconnect = async (connectionInfo, logger, cb) => {
	cb();
};

const testConnection = async (connectionInfo, logger, cb, app) => {
	logInfo('Test connection', connectionInfo, logger);
	const connectionCallback = async (err,{redshiftInstance}) => {
		if(err){
			cb(err)
			return;
		}

		try {
			await redshiftInstance.describeTags().promise();
			cb();
		} catch (err) {
			logger.log('error', { message: err.message, stack: err.stack, error: err }, 'Connection failed');
			cb(err);
		}
	};
	connect(connectionInfo, logger, connectionCallback, app);
};

const getDatabases = (connectionInfo, logger, cb) => {
	cb();
};

const getDocumentKinds = (connectionInfo, logger, cb) => {
	cb();
};

const getDbCollectionsNames = async (connectionInfo, logger, cb, app) => {
	const connectionCallback = async (err,{redshiftDataInstance, connectionParams}) => {
		if(err){
			cb(err)
			return;
		}
		try {
			const tables = await redshiftDataInstance.listTables({...connectionParams, SchemaPattern: "public"}).promise();
			const tableNames = tables.Tables
				.filter(({type}) => type==="TABLE"||type==="VIEW")
				.map(({name}) => name)
			const result = [{
				dbName: connectionParams.Database,
				dbCollections: tableNames,
				isEmpty: _.isEmpty(tableNames),
			}];
			cb(null, result);
		} catch(err) {
			logger.log(
				'error',
				{ message: err.message, stack: err.stack, error: err },
				'Retrieving databases and tables information'
			);
			cb({ message: err.message, stack: err.stack });
		}
	};

	logInfo('Retrieving databases and tables information', connectionInfo, logger);
	connect(connectionInfo, logger, connectionCallback, app);
};

const getDbCollectionsData = async (data, logger, cb, app) => {
	try {
		const dataBaseName = data.collectionData.dataBaseNames[0];
		const tableNames = data.collectionData.collections[dataBaseName];
		
		const tablesData = await Promise.all(
			tableNames.map(tableName => this.redshift.redshiftDataInstance.describeTable({...this.redshift.connectionParams, Schema: "public", Table:tableName}).promise())
		);


	} catch (err) {
		handleError(logger, err, cb);
	}
};

const getCount = (count, recordSamplingSettings) => {
	const per = recordSamplingSettings.relative.value;
	const size = (recordSamplingSettings.active === 'absolute')
		? recordSamplingSettings.absolute.value
		: Math.round(count / 100 * per);
	return size;
};

const handleError = (logger, error, cb) => {
	const message = _.isString(error) ? error : _.get(error, 'message', 'Reverse Engineering error')
	logger.log('error', { error }, 'Reverse Engineering error');

	cb(message);
};

const initDependencies = app => {
	setDependencies(app);
	_ = dependencies.lodash;
	snowflakeHelper.setDependencies(dependencies);
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