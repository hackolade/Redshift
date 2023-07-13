'use strict';

const noConnectionError = { message: 'Connection error' };
const ddlViewCreationHelper = require('./ddlViewCreationHelper')
let _;
let containers = {};
let types = {}
let helperLogger;
let redshift = null;
let aws = null;

const getParamsForConnect = (connectionInfo) => {
	const { accessKeyId, secretAccessKey, region, sessionToken } = connectionInfo;
	const params = {
		...(region === 'none' ? {} : { region }),
		maxAttempts: 5,
	};
	if (!accessKeyId || !secretAccessKey) {
		return params;
	}

	return {
		...params,
		credentials: {
			accessKeyId,
			secretAccessKey,
			sessionToken,
		},
	}
}

const connect = async (connectionInfo, logger) => {
	helperLogger = logger;
	const { clusterIdentifier, databaseName, workgroupName, instanceType = 'Cluster' } = connectionInfo;
	const params = getParamsForConnect(connectionInfo);
	const redshiftDataInstance = new aws.redshiftData.RedshiftData({ apiVersion: '2019-12-20', ...params });
	if (instanceType === 'Cluster') {
		redshift = await setCluster(params, clusterIdentifier, databaseName);
	} else if (instanceType === 'ServerLess') {
		redshift = await setServerLess(params, workgroupName, databaseName);
	}
	redshift = { ...redshift, redshiftDataInstance, instanceType };
}

const setCluster = async (params, clusterIdentifier, databaseName) => {
	const redshiftInstance = new aws.redshift.Redshift({ apiVersion: '2012-12-01', ...params });
	const clusters = await redshiftInstance.describeClusters({ ClusterIdentifier: clusterIdentifier });
	const requiredCluster = clusters.Clusters.find(cluster => cluster.ClusterIdentifier === clusterIdentifier);
	if (!requiredCluster) {
		throw new Error(`Cluster with '${clusterIdentifier}' identifier was not found`)
	}
	const connectionParams = {
		ClusterIdentifier: requiredCluster.ClusterIdentifier,
		Database: databaseName.toLowerCase(),
		DbUser: requiredCluster.MasterUsername,
	}
	return {
		redshiftInstance,
		connectionParams,
	}
}

const setServerLess = async (params, workgroupName, databaseName) => {
	const redshiftInstance = new aws.redshiftLess.RedshiftServerless({ apiVersion: '2021-04-21', ...params });
	const workGroups = await listWorkGroups(redshiftInstance);
	const requiredWorkGroup = workGroups.find(workgroup => workgroup.workgroupName === workgroupName);
	if (!requiredWorkGroup) {
		throw new Error(`Workgoup with '${workgroupName}' name was not found`)
	}
	const connectionParams = {
		WorkgroupName: workgroupName,
		Database: databaseName.toLowerCase(),
	}
	return {
		redshiftInstance,
		connectionParams,
	}
}

const listWorkGroups = async (redshiftInstance) => {
	let workGroups = [];
	let NextToken;
	do {
		const result = await redshiftInstance.listWorkgroups({ maxResults: 10, NextToken});
		workGroups = [...workGroups, ...result?.workgroups || []];
		NextToken = result.NextToken;
	} while (NextToken)

	return workGroups
}

const testConnection = async (connectionInfo, logger) => {
	await connect(connectionInfo, logger)
	await redshift.redshiftDataInstance.listTables({ ...redshift.connectionParams });
}

const execute = async (sqlStatement) => {
	if (!redshift && !redshift.redshiftDataInstance) {
		helperLogger.log('error', { message: "Redshift instance wasn't created" });
		return Promise.reject(noConnectionError)
	}
	helperLogger.log('info', { message: `Executing query: ${sqlStatement}` }, 'execute');
	const { Id } = await redshift.redshiftDataInstance.executeStatement({ ...redshift.connectionParams, Sql: sqlStatement });
	let records = [];
	let NextToken;
	let queryDescription;
	do {
		queryDescription = await redshift.redshiftDataInstance.describeStatement({ Id });
		if (queryDescription.Error) {
			throw new Error(queryDescription.Error)
		}
	} while (queryDescription.Status !== "FINISHED");
	do {
		const queryResult = await redshift.redshiftDataInstance.getStatementResult({ Id, NextToken });
		records = records.concat(queryResult.Records)
		NextToken = queryResult.NextToken;
	} while (NextToken);
	return records;
}

const executeApplyToInstanceScript = async (sqlStatement) => {
	if (!redshift && !redshift.redshiftDataInstance) {
		return Promise.reject(noConnectionError)
	}
	const result = await redshift.redshiftDataInstance.executeStatement({ ...redshift.connectionParams, Sql: sqlStatement });
	const { Id } = result
	let queryDescription;
	do {
		queryDescription = await redshift.redshiftDataInstance.describeStatement({ Id });
		if (queryDescription.Error) {
			throw new Error(queryDescription.Error)
		}
	} while (queryDescription.Status !== "FINISHED");

	return {};
}

const getTableDDL = async (schemaName, tableName) => {
	const getTableDDLQuery = ddlViewCreationHelper.getTablesDDLQuery(schemaName, tableName)
	let records = await execute(getTableDDLQuery);
	const recordsWithoutDropCommand = records.slice(1);
	return concatRecords(recordsWithoutDropCommand);
}

const getViewDDL = async (schemaName, viewName) => {
	const getViewDDLQuery = ddlViewCreationHelper.getViewsDDLQuery(schemaName, viewName);
	let records = await execute(getViewDDLQuery);
	return _.get(records, '[0][0].stringValue');
};

const getViewDescription = async viewName => {
	const res = await execute(
		`SELECT obj_description(oid) AS description FROM pg_class WHERE relkind = 'v' AND relname = '${viewName}'`,
	);
	return _.get(res, '[0][0].stringValue');
};

const concatRecords = (records) => {
	const skipNewLineRecords = ['(', ')', ';']
	const ddl = records.reduce((ddl, record) => {
		const recordValue = _.get(record, '[4].stringValue')
		if (skipNewLineRecords.includes(recordValue)) {
			return ddl + recordValue;
		}
		return ddl + `\n${recordValue}`;
	}, '');
	return ddl;
}

const getSchemaNames = async () => {
	const systemSchemaNames = ['information_schema', 'pg_catalog', 'catalog_history', 'pg_internal']
	let schemas = [];
	let NextToken;

	do {
		const listSchemasResult = await redshift.redshiftDataInstance.listSchemas({ ...redshift.connectionParams, NextToken });
		NextToken = listSchemasResult.NextToken;
		schemas = schemas.concat(listSchemasResult.Schemas)
	} while (NextToken);

	return schemas
		.filter(schema => !systemSchemaNames.includes(schema))
		.filter(schema => (!schema.match(/^pg_toast.*$/)) && (!schema.match(/^pg_temp_.*$/)));
}

const getAllTables = async (params, logger) => {
	const tablesResponse = await redshift.redshiftDataInstance.listTables(params);

	if (!tablesResponse.NextToken) {
		logger.info('all tables retrieved');

		return tablesResponse.Tables;
	}

	logger.info('getting next chunk of tables');

	return tablesResponse.Tables.concat(
		await getAllTables({...params, NextToken: tablesResponse.NextToken }, logger),
	);
};

const getSchemaCollectionNames = async (schemaName, logger) => {
	const tables = await getAllTables({ ...redshift.connectionParams, SchemaPattern: schemaName }, logger);
	const tableNames = tables
		.filter(({ type }) => type === "TABLE" || type === "VIEW")
		.map(({ name, type }) => markViewName(name, type));

	logger.info(`Found ${tableNames.length} tables and views in schema "${schemaName}"`);

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

	let dbUser = redshift.connectionParams.DbUser;
	let unlimitedQuota;
	let quota;
	if (redshift.instanceType !== 'Cluster') {
		dbUser = await getSchemaUserOwner(schemaName);
	} else if (redshift.instanceType === 'Cluster') {
		quota = await getSchemaQuota(schemaName);
		unlimitedQuota = quota ? false : true;
	}

	const description = await getSchemaDescription(schemaName);
	const functions = await getFunctions(schemaName, dbUser);
	const procedures = await getProcedures(schemaName, dbUser);
	const externalOptions = await getExternalOptions(schemaName)

	const data = {
		description,
		authorizationUsername: dbUser,
		unlimitedQuota,
		quota,
		Procedures: procedures,
		UDFs: functions,
		...externalOptions
	};

	containers[schemaName] = data;

	return data;
}

const getSchemaUserOwner = async schemaName => {
	const userOwners = await execute(ddlViewCreationHelper.getSchemaUserOwner());
	const userOwner = (userOwners || []).find(userOwner => _.get(userOwner, '[0].stringValue') === schemaName);

	return _.get(userOwner, '[1].stringValue');
}

const getSchemaQuota = async (schemaName) => {
	const quota = await execute(`SELECT quota FROM svv_schema_quota_state WHERE schema_name =  '${schemaName}';`)
	return _.get(quota, '[0][0].longValue')
}

const getSchemaDescription = async schemaName => {
	const res = await execute(
		`SELECT obj_description(oid, 'pg_namespace') AS description FROM pg_namespace WHERE nspname = '${schemaName}';`,
	);

	return _.get(res, '[0][0].stringValue');
};

const getExternalOptions = async (schemaName) => {
	const external = await execute(`SELECT schema_type, source_database, schema_option FROM svv_all_schemas WHERE schema_name =  '${schemaName}';`);
	const schemaType = _.get(external, '[0][0].stringValue');
	const isExternal = schemaType === 'external';

	return {
		external: isExternal,
	};
};

const getFunctions = async (schemaName, dbUser) => {
	const userOIDRecord = await execute(`SELECT usesysid FROM pg_user WHERE usename = '${dbUser}';`)
	const userOID = _.get(userOIDRecord, '[0][0].longValue')
	const schemaOIDRecord = await execute(`SELECT oid FROM pg_namespace WHERE nspname = '${schemaName}';`)
	const schemaOID = _.get(schemaOIDRecord, '[0][0].longValue')
	const functionsDataRecords = await execute(ddlViewCreationHelper.getSchemaFunctionsData(schemaOID, userOID))
	const functionsData = await Promise.all(functionsDataRecords.map(async record => {
		const funcName = _.get(record, '[0].stringValue', '');
		const language = _.get(record, '[1].stringValue', '')
		const statement = _.get(record, '[2].stringValue', '');
		const typess = _.get(record, '[3].stringValue', '').split(' ');
		const inputArgsNames = getArgsNames(_.get(record, '[6].stringValue', ''));
		const convertedInputArgTypes = await Promise.all(typess.map(async (typeOID, index) => {
			if (types[typeOID]) {
				return getArg(types[typeOID], inputArgsNames[index]);
			}
			const typeNameRecord = await execute(`SELECT typname from pg_type WHERE oid = '${typeOID}';`)
			const typeName = _.get(typeNameRecord, '[0][0].stringValue', '')
			types[typeOID] = typeName

			return getArg(typeName, inputArgsNames[index]);
		}));
		const inputArgTypes = convertedInputArgTypes.join(', ');
		const returnType = _.get(record, '[4].stringValue', '');
		const volatility = getVolatility(_.get(record, '[5].stringValue', ''));
		return {
			name: funcName,
			functionArguments: inputArgTypes,
			functionReturnType: returnType,
			functionVolatility: volatility,
			functionBody: statement,
			functionLanguage: language
		}
	}))
	return functionsData
}

const getVolatility = (volatilitySign) => {
	switch (volatilitySign) {
		case 's':
			return 'Stable'
		case 'i':
			return 'Immutable'
		default:
			return 'Volatile'
	}
}

const getProcedures = async (schemaName, dbUser) => {
	const userOIDRecord = await execute(`SELECT usesysid FROM pg_user WHERE usename = '${dbUser}';`)
	const userOID = _.get(userOIDRecord, '[0][0].longValue')
	const schemaOIDRecord = await execute(`SELECT oid FROM pg_namespace WHERE nspname = '${schemaName}';`)
	const schemaOID = _.get(schemaOIDRecord, '[0][0].longValue')
	const proceduresDataRecords = await execute(ddlViewCreationHelper.getSchemaProceduresData(schemaOID, userOID))
	const proceduresData = await Promise.all(proceduresDataRecords.map(async record => {
		const funcName = _.get(record, '[0].stringValue', '');
		const language = _.get(record, '[1].stringValue', '')
		const body = _.get(record, '[2].stringValue', '');
		const typess = _.get(record, '[3].stringValue', '').split(' ');
		const inputArgsNames = getArgsNames(_.get(record, '[4].stringValue', ''));
		const convertedInputArgTypes = await Promise.all(typess.map(async (typeOID, index) => {
			if (types[typeOID]) {
				return getArg(types[typeOID], inputArgsNames[index]);
			}
			const typeNameRecord = await execute(`SELECT typname from pg_type WHERE oid = '${typeOID}';`);
			const typeName = _.get(typeNameRecord, '[0][0].stringValue', '');
			types[typeOID] = typeName;

			return getArg(typeName, inputArgsNames[index]);
		}));
		const inputArgTypes = convertedInputArgTypes.join(', ');
		return {
			name: funcName,
			inputArgs: inputArgTypes,
			body,
			storedProcLanguage: language
		}
	}))
	return proceduresData
}

const getArg = (type, argName) => {
	if (!Boolean(argName)) {
		return type;
	}

	return `${argName} ${type}`;
}

const getArgsNames = argsName => {
	const resMatch = argsName.match(/^\{([\s\S]+)\}$/);
	if (!Boolean(resMatch)) {
		return [];
	}

	return resMatch[1].split(',').map(res => res.replaceAll('"', ''));
}

const getModelData = async () => {
	if (redshift.instanceType === 'Cluster') {
		return await getClusterModelData();
	}

	return await getServerLessModelData();
}

const getClusterModelData = async () => {
	const clustersData = await redshift.redshiftInstance.describeClusters({ ClusterIdentifier: redshift.connectionParams.ClusterIdentifier });
	const selctedClusterData = _.first(clustersData.Clusters);
	const clusterNamespace = selctedClusterData.ClusterNamespaceArn.match(/namespace:([\d\w-]+)/)[1];
	const tags = selctedClusterData.Tags.map(tag => ({ key: tag.Key, value: tag.Value }));
	return {
		author: selctedClusterData.MasterUsername,
		clusterIdentifier: selctedClusterData.ClusterIdentifier,
		clusterNamespace,
		host: selctedClusterData.Endpoint.Address,
		port: selctedClusterData.Endpoint.Port,
		databaseName: selctedClusterData.DBName,
		instanceType: redshift.instanceType,
		tags
	}
}

const getServerLessModelData = async () => {
	const { workgroup } = await redshift.redshiftInstance.getWorkgroup({ workgroupName: redshift.connectionParams.WorkgroupName });

	return {
		host: workgroup.endpoint.address,
		port: workgroup.endpoint.port,
		databaseName: redshift.connectionParams.Database,
		workgroupName: workgroup.workgroupName,
		instanceType: redshift.instanceType,
	};
}

const getRowsCount = async tableName => {
	try {
		const record = await execute(`SELECT count(*) AS COUNT FROM ${tableName};`);
		return _.get(record, '[0][0].longValue')
	} catch {
		return '';
	}
};

const getSampleDocSize = (count, recordSamplingSettings) => {
	if (recordSamplingSettings.active === 'absolute') {
		return Number(recordSamplingSettings.absolute.value);
	}

	const limit = Math.ceil((count * recordSamplingSettings.relative.value) / 100);

	return Math.min(limit, recordSamplingSettings.maxValue);
};

const handleSuper = (documents, name) => {
	const types = documents.reduce((types, document) => {
		if (types.includes('object')) {
			return types;
		}
		const property = _.get(document, name);
		const type = getSuperPropertyType(property);

		if (types.includes(type)) {
			return types;
		}

		return [...types, type];
	}, []);

	let properties = {};
	let type = _.first(types);
	if (types.includes('object')) {
		type = 'object';
	} else if (types.includes('array')) {
		type = 'array';
	} else if (type === 'null' && types.length > 1) {
		type = types[1];
	}
	if (type === 'array') {
		properties = { items: [] };
	} else if (type === 'object') {
		properties = { properties: {} };
	}

	return { type: 'super', superType: 'JSON', subtype: type, ...properties };
};

const getSuperPropertyType = property => {
	const type = typeof property;

	if (_.isArray(property)) {
		return 'array';
	} else if (_.isNil(property)) {
		return 'null';
	}

	return type;
};


const describeTable = async (schemaName, tableName) => {
	try {
		const records = await redshift.redshiftDataInstance.describeTable({ ...redshift.connectionParams, Table: tableName, Schema: schemaName });
		return _.get(records, 'ColumnList').map(column => ({ name: column.name, type: column.typeName }))
	} catch (err) {
		return [];
	}
}

const handleJsonString = value => {
	if (typeof value !== 'string') {
		return value;
	}

	try {
		return JSON.parse(value);
	} catch(err) {
		return value;
	}
}

const getDocuments = async (schemaName, tableName, quantity, recordSamplingSettings) => {
	const limit = getSampleDocSize(quantity, recordSamplingSettings)
	const columns = await describeTable(schemaName, tableName);
	if (!tableHasColumnsOfSuperType(columns)) {
		return [];
	}
	const records = await execute(`SELECT * FROM "${schemaName}"."${tableName}" LIMIT ${limit};`);
	const documents = records.map(document =>
		document.reduce((rows, row, index) => {
			if (row && columns[index].type === 'super') {
				let value = JSON.parse(_.first(Object.values(row)));
				value = handleJsonString(value);
				return { ...rows, [`${columns[index].name}`]: value }
			}
			return rows;
		}, {}))
		.filter(document => !_.isEmpty(document))
		.map(filterNull);
	return documents;
};

const tableHasColumnsOfSuperType = (columns) => {
	const columnsOfSuperType = columns.filter(column => column.type === "super");
	return !_.isEmpty(columnsOfSuperType)
}

const filterNull = row => {
	return Object.keys(row).reduce((filteredRow, key) => {
		const value = row[key];
		if (_.isNull(value)) {
			return filteredRow;
		}
		return {
			...filteredRow,
			[key]: value
		};
	}, {});
};

const getJsonSchema = async ({ documents, schemaName, tableName, logger}) => {
	try {
		let rows = await describeTable(schemaName, tableName)
		rows = rows.filter(row => row.type === 'super')
		return {
			properties: getJsonSchemaFromRows(documents, rows)
		};
	} catch (err) {
		logger.error(err);
		return { properties: {} };
	}
};

const getJsonSchemaFromRows = (documents, rows) => {
	const properties = rows
		.reduce((properties, row) => {
			return {
				...properties,
				[row.name]: handleSuper(documents, row.name)
			};
		}, {});
	return properties;
};


const handleComplexTypesDocuments = (jsonSchema, documents) => {
	try {
		return documents.map(row => {
			return Object.keys(row).reduce((rows, key) => {
				const property = row[key];
				const schemaRow = _.get(jsonSchema, ['properties', key]);
				if (_.toLower(_.get(schemaRow, 'type')) === 'array') {
					if (!_.isArray(property)) {
						return {
							...rows,
							[key]: property
						};
					}
					return {
						...rows,
						[key]: property.reduce((items, item) => {
							if (_.isObject(item)) {
								return [...items, JSON.stringify(item)];
							}
							return items;
						}, [])
					};
				}
				return {
					...rows,
					[key]: property
				};
			}, {})
		});
	} catch (err) {
		return documents;
	}
}

const setDependencies = (dependencies) => {
	_ = dependencies.lodash;
	aws = dependencies.aws;
};

module.exports = {
	execute,
	connect,
	testConnection,
	setDependencies,
	getSchemaNames,
	splitTableAndViewNames,
	executeApplyToInstanceScript,
	handleComplexTypesDocuments,
	getSchemaCollectionNames,
	getContainerData,
	getTableDDL,
	getSchemaQuota,
	getViewDDL,
	getRowsCount,
	getDocuments,
	getJsonSchema,
	getModelData,
	getViewDescription
};
