const defaultTypes = require('./configs/defaultTypes');
const templates = require('./configs/templates');
const types = require('./configs/types');

module.exports = (baseProvider, options, app) => {
	const _ = app.require('lodash');
	const { hasType } = app.require('@hackolade/ddl-fe-utils').general;
	const assignTemplates = app.require('@hackolade/ddl-fe-utils').assignTemplates;
	const {
		foreignKeysToString,
		checkIfForeignKeyActivated,
		foreignActiveKeysToString,
		viewColumnsToString,
		hydrateUdf,
		hydrateProcedure,
		filterUdf,
		filterProcedure,
		setOrReplace,
		getCompositeName,
		toString,
	} = require('./helpers/general')(app);
	const {
		decorateType,
		getDefault,
		getQuota,
		getUri,
		getARN,
		getSourceSchemaNameForExternalSchema,
		getColumnComments,
	} = require('./helpers/columnDefinitionHelper')(app);
	const { generateConstraint } = require('./helpers/constraintHelper')(app);
	const commentIfDeactivated = require('./helpers/commentDeactivatedHelper')(app);
	const { getTableAttributes, getTableConstraints, getTableLikeConstraint } = require('./helpers/tableHelper')(app);

	return {
		createDatabase({
			name,
			authorization,
			quota,
			sourceDBName,
			ifNotExist,
			sourceSchemaName,
			source,
			external,
			iamRole,
			secretARN,
			catalogRole,
			uri,
			region,
			createExternalDatabase,
			functions,
			procedures,
			comment,
		}) {
			let database;
			const schemaComment = assignTemplates(templates.comment, {
				object: 'SCHEMA',
				objectName: getCompositeName(name),
				comment: toString(comment),
			});
			if (external) {
				database = assignTemplates(templates.createExternalSchema, {
					name,
					ifNotExist,
					source,
					sourceDBName,
					sourceSchemaName,
					region,
					uri,
					iamRole,
					secretARN,
					catalogRole,
					createExternalDatabase,
				});
			} else {
				database = assignTemplates(templates.createSchema, {
					name,
					ifNotExist,
					authorization,
					quota,
				});
			}
			const userFunctions = functions.map(func => assignTemplates(templates.createFunction, setOrReplace(func)));
			const userProcedures = procedures.map(procedure =>
				assignTemplates(templates.createProcedure, setOrReplace(procedure)),
			);
			return [database, _.trimStart(schemaComment), ...userFunctions, ...userProcedures].join('\n');
		},

		createTable(tableData, isActivated) {
			const temporary = tableData.temporary ? 'TEMPORARY ' : '';
			const asSelect = tableData.selectStatement;
			const schemaName = tableData.schemaName === '' ? 'public' : tableData.schemaName;
			const comment = assignTemplates(templates.comment, {
				object: 'TABLE',
				objectName: getCompositeName(tableData.name, schemaName),
				comment: toString(tableData.comment),
			});
			const columnDescriptions = getColumnComments(
				getCompositeName(tableData.name, schemaName),
				tableData.columnDefinitions,
			);

			if (asSelect) {
				return assignTemplates(templates.createTableAs, {
					name: tableData.name,
					temporary: temporary,
					schemaName,
					backup: tableData.backup,
					tableAttributes: getTableAttributes(
						tableData.distStyle,
						tableData.distKey,
						tableData.compoundSortKey,
					),
					query: asSelect,
					comment: tableData.comment ? comment : '',
					columnDescriptions,
				});
			}
			const columnDefinitions = tableData.columns
				.map(column => commentIfDeactivated(column.statement, column))
				.join(',\n\t');
			return assignTemplates(templates.createTable, {
				name: tableData.name,
				schemaName,
				temporary: temporary,
				likeStatement: getTableLikeConstraint(
					tableData.likeTableName,
					tableData.includeDefaults,
					!_.isEmpty(columnDefinitions),
				),
				ifNotExist: tableData.ifNotExist,
				columnDefinitions: columnDefinitions !== '' ? '\n\t' + columnDefinitions : '',
				tableConstraints: getTableConstraints(
					tableData.backup,
					tableData.compoundUniqueKey,
					tableData.compoundPrimaryKey,
					tableData.foreignKeyConstraints,
				),
				tableAttributes: getTableAttributes(tableData.distStyle, tableData.distKey, tableData.compoundSortKey),
				comment: tableData.comment ? comment : '',
				columnDescriptions,
			});
		},

		createView(viewData, dbData, isActivated) {
			if (_.isEmpty(viewData.keys)) {
				return '';
			}
			const schemaName = viewData.schemaName === '' ? 'public' : viewData.schemaName;
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

			const comment = assignTemplates(templates.comment, {
				object: 'VIEW',
				objectName: getCompositeName(viewData.name, schemaName),
				comment: toString(viewData.comment),
			});

			if (viewData.materialized) {
				return assignTemplates(templates.createMaterializedView, {
					backup: viewData.backup ? '\nBACKUP YES' : '',
					name: viewData.name,
					schemaName,
					autoRefresh: viewData.autoRefresh ? '\nAUTO REFRESH YES' : '',
					tableAttributes: getTableAttributes(viewData.distStyle, viewData.distKey, {}),
					table_columns: !_.isEmpty(tableColumns)
						? '\n\t' + viewColumnsToString(tableColumns, isActivated)
						: '',
					table_name: tables.join('" INNER JOIN "'),
					comment: viewData.comment ? comment : '',
				});
			}
			return assignTemplates(templates.createView, {
				orReplace: viewData.orReplace ? ' OR REPLACE' : '',
				name: viewData.name,
				schemaName,
				column_list: viewColumnsToString(columnList, isActivated),
				withNoSchema: viewData.withNoSchema ? ' WITH NO SCHEMA BINDING' : '',
				table_columns: !_.isEmpty(tableColumns) ? '\n\t' + viewColumnsToString(tableColumns, isActivated) : '',
				table_name: tables.join('" INNER JOIN "'),
				comment: viewData.comment ? comment : '',
			});
		},

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
				functions: Array.isArray(udfs) ? udfs.map(hydrateUdf(containerData.name)).filter(filterUdf) : [],
				procedures: Array.isArray(procedures)
					? procedures.map(hydrateProcedure(containerData.name)).filter(filterProcedure)
					: [],
				comment: containerData.description,
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
				comment: firstTab.description,
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
				comment: firstTab.description,
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
				comment: jsonSchema.refDescription || jsonSchema.description,
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

		// * statements for alter script from delta model
		dropSchema(schemaName) {
			return assignTemplates(templates.dropSchema, { name: schemaName });
		},

		alterSchema({ name, quota }) {
			return assignTemplates(templates.alterSchema, { name, quota });
		},

		createUdf(func) {
			return assignTemplates(templates.createFunction, setOrReplace(func));
		},

		createProcedure(procedure) {
			return assignTemplates(templates.createProcedure, setOrReplace(procedure));
		},

		dropUdf(func) {
			return assignTemplates(templates.dropFunction, func);
		},

		dropProcedure(procedure) {
			return assignTemplates(templates.dropProcedure, procedure);
		},

		dropTable(name) {
			return assignTemplates(templates.dropTable, { name });
		},

		alterTableOptions(
			jsonSchema,
			dbData,
			{ isPrimaryKeyModified, isUniqueKeyModified, isDistKeyModified, isSortKeyModified },
		) {
			const name = getCompositeName(jsonSchema.code || jsonSchema.name, dbData.name);
			let scripts = [];

			if (isDistKeyModified) {
				const distStyle = jsonSchema.DISTSTYLE ? `DISTSTYLE ${jsonSchema.DISTSTYLE.toUpperCase()}` : '';
				const distKey =
					_.toUpper(jsonSchema.DISTSTYLE) === 'KEY'
						? `DISTKEY ${jsonSchema.distKey?.[0]?.compositeDistKey?.[0]?.name || ''}`
						: '';
				const distConstraint = `${distStyle} ${distKey}`;

				scripts.push(assignTemplates(templates.alterDistKey, { name, distConstraint }));
			}

			if (isSortKeyModified) {
				const sortStyle = _.toUpper(jsonSchema.sortStyle || '');
				const sortKey = _.get(jsonSchema, 'sortKey[0].compositeSortKey', []);
				const sortKeyConstraint = generateConstraint(
					sortKey,
					templates.compoundSortKey,
					jsonSchema.isActivated,
					{ sortStyle },
				).statement;

				scripts.push(assignTemplates(templates.alterSortKey, { name, sortKeyConstraint }));
			}

			if (isPrimaryKeyModified && !_.isEmpty(jsonSchema.primaryKey)) {
				const primaryKey = _.get(jsonSchema, 'primaryKey[0].compositePrimaryKey', []);
				const primaryKeyConstraint = generateConstraint(
					primaryKey,
					templates.compoundPrimaryKey,
					jsonSchema.isActivated,
				).statement;

				scripts.push(assignTemplates(templates.alterPrimaryKey, { name, primaryKeyConstraint }));
			}

			if (isUniqueKeyModified && !_.isEmpty(jsonSchema.uniqueKey)) {
				const uniqueKey = _.get(jsonSchema, 'uniqueKey[0].compositeUniqueKey', []);
				const uniqueConstraint = generateConstraint(
					uniqueKey,
					templates.compoundUniqueKey,
					jsonSchema.isActivated,
				).statement;

				scripts.push(assignTemplates(templates.alterUnique, { name, uniqueConstraint }));
			}

			return scripts.filter(Boolean).join('\n\n');
		},

		renameColumn(tableName, oldColumnName, newColumnName) {
			return assignTemplates(templates.renameColumn, { tableName, oldColumnName, newColumnName });
		},

		alterColumnType(tableName, column) {
			return assignTemplates(templates.alterColumnType, {
				tableName,
				columnName: column.name,
				type: decorateType(column.type, column),
			});
		},

		addColumn(tableName, columnStatement) {
			return assignTemplates(templates.addColumn, { tableName, columnStatement });
		},

		dropColumn(tableName, columnName) {
			return assignTemplates(templates.dropColum, { tableName, columnName });
		},

		dropView(fullName) {
			return assignTemplates(templates.dropView, { name: fullName });
		},
	};
};
