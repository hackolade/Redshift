const defaultTypes = require('./configs/defaultTypes');
const templates = require('./configs/templates');
const types = require('./configs/types');

module.exports = (baseProvider, options, app) => {
	const _ = app.require('lodash');
	const { tab, hasType, clean } = app.require('@hackolade/ddl-fe-utils').general;
	const assignTemplates = app.require('@hackolade/ddl-fe-utils').assignTemplates;
	const { foreignKeysToString, checkIfForeignKeyActivated, foreignActiveKeysToString } =
		require('./helpers/general')(app);
	const { decorateType, getDefault, getQuota, getUri, getARN, getSourceSchemaNameForExternalSchema } =
		require('./helpers/columnDefinitionHelper')(app);
	const createStatements = require('./helpers/createStatements')(app);
	const { generateConstraint } = require('./helpers/constraintHelper')(app);
	const commentIfDeactivated = require('./helpers/commentDeactivatedHelper')(app);

	return createStatements({
		createForeignKeyConstraint(fkData, dbData) {
			const currentSchema = dbData.name ? dbData.name : 'public';
			const isRelationActivated = checkIfForeignKeyActivated(fkData);
			const foreignKeys = isRelationActivated
				? foreignKeysToString(fkData.foreignKey)
				: foreignActiveKeysToString(fkData.foreignKey);
			const primaryKeys = isRelationActivated
				? foreignKeysToString(fkData.primaryKey)
				: foreignActiveKeysToString(fkData.primaryKey);

			const foreignKeyStatement = assignTemplates(templates.createTableForeignKey, {
				columns: '"' + foreignKeys + '"',
				primary_table: `"${fkData.primarySchemaName || currentSchema}"."${fkData.primaryTable}"`,
				primary_columns: '"' + primaryKeys + '"',
			});

			return {
				statement: foreignKeyStatement,
				isActivated: isRelationActivated,
			};
		},

		convertColumnDefinition(columnDefinition) {
			const columnStatement = assignTemplates(templates.columnDefinition, {
				name: columnDefinition.name,
				type: decorateType(columnDefinition.type, columnDefinition),
				unique: columnDefinition.unique ? ' UNIQUE' : '',
				default: !_.isUndefined(columnDefinition.default)
					? ' DEFAULT ' + getDefault(columnDefinition.type, columnDefinition.default)
					: '',
				distKey: columnDefinition.distKey ? ' DISTKEY' : '',
				sortKey: columnDefinition.sortKey ? ' SORTKEY' : '',
				primaryKey: columnDefinition.primaryKey ? ' PRIMARY KEY' : '',
				notNull: !columnDefinition.nullable ? ' NOT NULL' : '',
				encoding: columnDefinition.encoding ? ` ENCODE ${columnDefinition.encoding}` : '',
				references: '',
			});
			return { statement: columnStatement, isActivated: columnDefinition.isActivated };
		},

		hydrateDatabase(containerData, { udfs, procedures } = {}) {
			return {
				name: containerData.name,
				authorization: containerData.authorizationUsername
					? ` AUTHORIZATION ${containerData.authorizationUsername}`
					: '',
				quota: getQuota(containerData.quota, containerData.unlimitedQuota),
				ifNotExist: containerData.ifNotExists ? ' IF NOT EXISTS' : '',
				sourceDBName:
					containerData.federatedDatabaseName ||
					containerData.dataCatalogDatabaseName ||
					containerData.redshiftDatabaseName,
				sourceSchemaName: getSourceSchemaNameForExternalSchema(
					containerData.federatedSchemaName,
					containerData.redshiftSchemaName,
					containerData.fromSource,
				),
				source: containerData.fromSource,
				external: containerData.external,
				iamRole: containerData.IAM_ROLE,
				secretARN: getARN(containerData.SECRET_ARN, containerData.fromSource),
				catalogRole:
					containerData.CATALOG_ROLE && containerData.source === 'Data catalog'
						? ` CATALOG_ROLE ${containerData.CATALOG_ROLE}`
						: '',
				uri: getUri(containerData.URI, containerData.port, containerData.fromSource),
				region: containerData.source === 'Data catalog' ? containerData.region : '',
				createExternalDatabase: containerData.createExternalDatabaseIfNotExists
					? ' CREATE EXTERNAL DATABASE IF NOT EXISTS'
					: '',
				functions: Array.isArray(udfs)
					? udfs
							.map(func =>
								clean({
									name: func.name || undefined,
									orReplace: func.orReplace ? ' OR REPLACE ' : undefined,
									arguments: func.functionArguments || func.storedProcArgument || undefined,
									returnDataType: func.functionReturnType || func.storedProcDataType || undefined,
									volatility:
										func.functionVolatility || func.storedProcVolatility
											? (func.functionVolatility || func.storedProcVolatility).toUpperCase()
											: undefined,
									statement:
										func.functionBody || func.storedProcFunction
											? tab(_.trim(func.functionBody || func.storedProcFunction))
											: undefined,
									language: func.functionLanguage || func.storedProcLanguage,
								}),
							)
							.filter(
								func =>
									func.name &&
									func.arguments &&
									func.language &&
									func.returnDataType &&
									func.statement,
							)
					: [],
				procedures: Array.isArray(procedures)
					? procedures
							.map(procedure =>
								clean({
									name: procedure.name || undefined,
									orReplace: procedure.orReplace ? ' OR REPLACE ' : undefined,
									arguments: procedure.inputArgs || undefined,
									statement: procedure.body ? tab(_.trim(procedure.body)) : undefined,
									securityMode: procedure.securityMode
										? `\nSECURITY ${procedure.securityMode}`
										: undefined,
									configurationParameter: procedure.configurationParameter
										? `\nSET configuration_parameter TO ${procedure.configurationParameter}`
										: undefined,
								}),
							)
							.filter(procedure => procedure.name && procedure.arguments && procedure.statement)
					: [],
			};
		},

		hydrateTable({ tableData, entityData, jsonSchema }) {
			const firstTab = _.get(entityData, '[0]', {});
			const secondTab = _.get(entityData, '[1]', {});
			const compoundUniqueKey = _.get(secondTab, 'uniqueKey[0].compositeUniqueKey', []).map(key => ({
				name: key.name,
				isActivated: key.isActivated,
			}));
			const compoundPrimaryKey = _.get(secondTab, 'primaryKey[0].compositePrimaryKey', []).map(key => ({
				name: key.name,
				isActivated: key.isActivated,
			}));
			const autoSortKey = firstTab.autoSortKey ?? true;
			const sortStyle = _.toUpper(firstTab.sortStyle || '');
			const sortKey = _.get(firstTab, 'sortKey[0].compositeSortKey', []).map(key => ({
				name: key.name,
				isActivated: key.isActivated,
			}));
			const distKey = _.get(firstTab, 'distKey[0].compositeDistKey[0].name', '');
			return {
				...tableData,
				schemaName: tableData.dbData.name,
				selectStatement: firstTab.selectStatement,
				includeDefaults: firstTab.includeDefualts,
				likeTableName: _.get(tableData, `relatedSchemas[${firstTab.like}].title`, ''),
				temporary: jsonSchema.temporary,
				ifNotExist: jsonSchema.ifNotExists ? ' IF NOT EXISTS' : '',
				backup: jsonSchema.BACKUP ? 'BACKUP YES' : '',
				distStyle: jsonSchema.DISTSTYLE ? `DISTSTYLE ${jsonSchema.DISTSTYLE.toUpperCase()}` : '',
				distKey: distKey !== '' ? `DISTKEY ("${distKey}")` : '',
				compoundPrimaryKey: _.isEmpty(compoundPrimaryKey)
					? ''
					: generateConstraint(compoundPrimaryKey, templates.compoundPrimaryKey, jsonSchema.isActivated),
				compoundUniqueKey: _.isEmpty(compoundUniqueKey)
					? ''
					: generateConstraint(compoundUniqueKey, templates.compoundUniqueKey, jsonSchema.isActivated),
				compoundSortKey:
					_.isEmpty(sortKey) || autoSortKey
						? ''
						: generateConstraint(sortKey, templates.compoundSortKey, jsonSchema.isActivated, { sortStyle }),
				query: '',
			};
		},

		hydrateView({ viewData, entityData }) {
			const firstTab = entityData[0];
			const distKey = _.get(firstTab, 'distKey[0].compositeDistKey[0].name', '');
			const { columnList, tableColumns, tables } = viewData.keys.reduce(
				(result, key) => {
					result.columnList.push({ name: `"${key.alias || key.name}"`, isActivated: key.isActivated });
					result.tableColumns.push({
						name: `"${key.entityName}"."${key.name}"`,
						isActivated: key.isActivated,
					});

					if (key.entityName && !result.tables.includes(key.entityName)) {
						result.tables.push(key.entityName);
					}

					return result;
				},
				{
					columnList: [],
					tableColumns: [],
					tables: [],
				},
			);

			if (_.isEmpty(tables)) {
				return '';
			}
			return {
				...viewData,
				backup: firstTab.BACKUP,
				schemaName: viewData.dbData.name,
				autoRefresh: firstTab.autoRefresh,
				materialized: firstTab.materialized,
				distStyle: firstTab.DISTSTYLE ? `DISTSTYLE ${firstTab.DISTSTYLE.toUpperCase()}` : '',
				distKey: distKey !== '' ? `DISTKEY ("${distKey}")` : '',
				orReplace: firstTab.orReplace,
				columnDefinitions: firstTab.description,
				withNoSchema: firstTab.withNoSchemaBindings,
				table_name: tables.join('" INNER JOIN "'),
			};
		},

		getTypesDescriptors() {
			return types;
		},

		getDefaultType(type) {
			return defaultTypes[type];
		},

		hydrateViewColumn(data) {
			return data;
		},

		hasType(type) {
			return hasType(types, type);
		},

		hydrateColumn({ columnDefinition, jsonSchema, dbData }) {
			return {
				...columnDefinition,
				unique: jsonSchema.unique && !jsonSchema.compositeUniqueKey,
				distKey: jsonSchema.distKey && !jsonSchema.compositeDistKey,
				sortKey: jsonSchema.sortKey && !jsonSchema.compositeSortKey,
				primaryKey: columnDefinition.primaryKey && !jsonSchema.compositePrimaryKey,
				encoding: jsonSchema.encoding,
				references: '',
			};
		},

		commentIfDeactivated(statement, data, isPartOfLine) {
			return commentIfDeactivated(statement, data, isPartOfLine);
		},
	});
};
