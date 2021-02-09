'use strict';

const noConnectionError = { message: 'Connection error' };
const ddlViewCreationHelper = require('./ddlViewCreationHelper')
const aws = require('aws-sdk');
let _;

let containers = {};
let types = {}
this.redshift = null;

const execute = async (sqlStatement) => {
	if (!this.redshift) {
		return Promise.reject(noConnectionError)
	}
	try {
		const {Id} = await this.redshift.redshiftDataInstance.executeStatement({ ...this.redshift.connectionParams, Sql: sqlStatement }).promise();
		let records = [];
		let NextToken;
		let queryDescription;
		do {
			queryDescription = await this.redshift.redshiftDataInstance.describeStatement({ Id }).promise();
		} while (queryDescription.Status !== "FINISHED");
		do {
			const queryResult = await this.redshift.redshiftDataInstance.getStatementResult({ Id, NextToken }).promise();
			records = records.concat(queryResult.Records)
			NextToken = queryResult.NextToken;
		} while (NextToken);
		return records;

	} catch (err) {
		debugger
	}
}


const getTableDDL = async (schemaName, tableName) => {
	const getTableDDLQuery = ddlViewCreationHelper.getTablesDDLQuery(schemaName,tableName)
	let records = await execute(getTableDDLQuery);
	const recordsWithoutDropCommand = records.slice(1);
	return concatRecords(recordsWithoutDropCommand);
}

const getViewDDL = async (schemaName,viewName) => {
	const getViewDDLQuery = ddlViewCreationHelper.getViewsDDLQuery(schemaName,viewName)
	let records = await execute(getViewDDLQuery);
	return _.get(records, '[0][0].stringValue')
	
}

const getViewData = async () => {
//todo add logic
}


const concatRecords = (records) => {
	const skipNewLineRecords = ['(', ')', ';']
	const ddl = records.reduce((ddl, record) => {
		const recordValue = _.get(record, '[4].stringValue')
		if (skipNewLineRecords.includes(recordValue)) {
			return ddl + recordValue;
		}
		return ddl + `\n${recordValue}`;
	}, '');
	console.log(ddl)
	return ddl;
}

const getSchemaNames = async () => {
	const systemSchemaNames = ['information_schema', 'pg_catalog', 'catalog_history', 'pg_internal']
	let schemas = [];
	let NextToken;

	do {
		const listSchemasResult = await this.redshift.redshiftDataInstance.listSchemas({ ...this.redshift.connectionParams, NextToken }).promise()
		NextToken = listSchemasResult.NextToken;
		schemas = schemas.concat(listSchemasResult.Schemas)
	} while (NextToken)

	return schemas
		.filter(schema => !systemSchemaNames.includes(schema))
		.filter(schema => (!schema.match(/^pg_toast.*$/)) && (!schema.match(/^pg_temp_.*$/)));
}

const getSchemaCollectionNames = async (schemaName) => {
	const tables = await this.redshift.redshiftDataInstance.listTables({ ...this.redshift.connectionParams, SchemaPattern: schemaName }).promise();
	const tableNames = tables.Tables
		.filter(({ type }) => type === "TABLE" || type === "VIEW")
		.map(({ name, type }) => markViewName(name, type))
	return {
		dbName: schemaName,
		dbCollections: tableNames,
		isEmpty: _.isEmpty(tableNames),
	};
}

const markViewName = (name, type) => {
	if (type === "VIEW") {
		return name + ' (v)'
	}
	return name;
}

const splitTableAndViewNames = names => {
	const namesByCategory = _.partition(names, isView);

	return { views: namesByCategory[0].map(name => name.slice(0, -4)), tables: namesByCategory[1] };
};

const isView = name => name.slice(-4) === ' (v)';

const getContainerData = async schemaName => {

	if (containers[schemaName]) {
		return containers[schemaName];
	}

	try {
		const functions = await getFunctions(schemaName);
		const procedures = await getProcedures(schemaName);
		const quota = await getSchemaQuota(schemaName);
		const unlimitedQuota = quota ? false : true;
		const externalOptions = await getExternalOptions(schemaName)

		const data = {
			authorizationUsername: this.redshift.connectionParams.DbUser,
			unlimitedQuota,
			quota,
			Procedures: procedures,
			Functions: functions,
			...externalOptions
		};

		containers[schemaName] = data;

		return data;
	} catch (err) {
		debugger
		return {};
	}
}

const getSchemaQuota = async (schemaName) => {
	const quota = await execute(`SELECT quota FROM svv_schema_quota_state WHERE schema_name =  '${schemaName}';`)
	return _.get(quota, '[0][0].longValue')
}

const getExternalOptions = async (schemaName) => {
	const external = await execute(`SELECT schema_type, source_database, schema_option FROM svv_all_schemas WHERE schema_name =  '${schemaName}';`)
	const schemaType = _.get(external, '[0][0].stringValue')
	const isExternal = schemaType === 'external'
	return {
		external: isExternal
	}
}

const getFunctions = async (schemaName) => {
	try{
	const userOIDRecord = await execute(`SELECT usesysid FROM pg_user WHERE usename = '${this.redshift.connectionParams.DbUser}';`)
	const userOID = _.get(userOIDRecord,'[0][0].longValue')
	const schemaOIDRecord = await execute(`SELECT oid FROM pg_namespace WHERE nspname = '${schemaName}';`)
	const schemaOID = _.get(schemaOIDRecord,'[0][0].longValue')
	const functionsDataRecords = await execute(ddlViewCreationHelper.getSchemaFunctionsData(schemaOID,userOID))
	const functionsData  = await Promise.all(functionsDataRecords.map(async record =>{
		const funcName = _.get(record,'[0].stringValue','');
		const language = _.get(record,'[1].stringValue','')
		const statement = _.get(record,'[2].stringValue','');
		const typess = _.get(record,'[3].stringValue','').split(' ');
		const convertedInputArgTypes  = await Promise.all(typess.map(async typeOID =>{
			if(types[typeOID]){
				return types[typeOID];;
			}
			const typeNameRecord = await execute(`SELECT typname from pg_type WHERE oid = '${typeOID}';`)
			const typeName =_.get(typeNameRecord,'[0][0].stringValue','')
			types[typeOID] = typeName

			return typeName;
		}));
		const inputArgTypes = convertedInputArgTypes.join(' ');
		const returnType = _.get(record,'[4].stringValue','');
		const volatility = getVolatility(_.get(record,'[5].stringValue',''));
		return {
			name:funcName,
			inputArgs:inputArgTypes,
			storedProcDataType:returnType,
			volatility,
			statement,
			language
		}
	}))
	return functionsData
	}catch(e){
		debugger
	}
}

const getVolatility = (volatilitySign) =>{
	switch(volatilitySign){
		case 's': 
		return 'Stable'
		case 'i': 
		return 'Immutable'
		default: 
		return 'Volatile'
	}
}

const getProcedures = async (schemaName) => {
	try{
		const userOIDRecord = await execute(`SELECT usesysid FROM pg_user WHERE usename = '${this.redshift.connectionParams.DbUser}';`)
		const userOID = _.get(userOIDRecord,'[0][0].longValue')
		const schemaOIDRecord = await execute(`SELECT oid FROM pg_namespace WHERE nspname = '${schemaName}';`)
		const schemaOID = _.get(schemaOIDRecord,'[0][0].longValue')
		const proceduresDataRecords = await execute(ddlViewCreationHelper.getSchemaProceduresData(schemaOID,userOID))
		const proceduresData  = await Promise.all(proceduresDataRecords.map(async record =>{
			const funcName = _.get(record,'[0].stringValue','');
			const language = _.get(record,'[1].stringValue','')
			const body = _.get(record,'[2].stringValue','');
			const typess = _.get(record,'[3].stringValue','').split(' ');
			const convertedInputArgTypes  = await Promise.all(typess.map(async typeOID =>{
				if(types[typeOID]){
					return types[typeOID];;
				}
				const typeNameRecord = await execute(`SELECT typname from pg_type WHERE oid = '${typeOID}';`)
				const typeName =_.get(typeNameRecord,'[0][0].stringValue','')
				types[typeOID] = typeName
	
				return typeName;
			}));
			const inputArgTypes = convertedInputArgTypes.join(' ');
			return {
				name:funcName,
				inputArgs:inputArgTypes,
				body,
				language
			}
		}))
		return proceduresData
		}catch(e){
			debugger
		}
}


const setRedshift = (redshift) => {
	this.redshift = redshift;
}
const setDependencies = ({ lodash }) => _ = lodash;

module.exports = {
	execute,
	setRedshift,
	setDependencies,
	getSchemaNames,
	splitTableAndViewNames,
	getSchemaCollectionNames,
	getContainerData,
	getTableDDL,
	getSchemaQuota,
	getViewData,
	getViewDDL
};
