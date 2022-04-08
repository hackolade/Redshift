module.exports = app => {
	const _ = app.require('lodash');
	const assignTemplates = app.require('@hackolade/ddl-fe-utils').assignTemplates;
	const templates = require('../configs/templates');
	const { viewColumnsToString } = require('./general')(app);
	const commentIfDeactivated = require('./commentDeactivatedHelper')(app);

	const getTableAttributes = (distStyle, distKey, compoundSortKey) => {
		let attributes = [];

		if (distStyle !== '') {
			attributes.push(distStyle);
		}

		if (distKey !== '') {
			attributes.push(distKey);
		}
		if (compoundSortKey.statement) {
			attributes.push(compoundSortKey.statement);
		}

		return !_.isEmpty(attributes) ? '\n' + attributes.join('\n') : '';
	};

	const getTableConstraints = (backup, compoundUniqueKey, compoundPrimaryKey, foreignKeyConstraints) => {
		let constraints = [];

		if (backup) {
			constraints.push(backup);
		}

		if (compoundUniqueKey.statement) {
			constraints.push(compoundUniqueKey.statement);
		}

		if (compoundPrimaryKey.statement) {
			constraints.push(compoundPrimaryKey.statement);
		}

		foreignKeyConstraints.forEach(constraint => {
			constraints.push(constraint.statement);
		});

		return !_.isEmpty(constraints) ? ',\n\t' + constraints.join(',\n\t') : '';
	};

	const getTableLikeConstraint = (likeTableName, includingDefault, needComma) => {
		if (likeTableName === '') {
			return '';
		}
		let likeStatement = `${needComma ? ',\n\t' : ''}LIKE ${likeTableName}`;
		if (includingDefault) {
			return likeStatement + ' INCLUDING DEFAULTS';
		}
		return likeStatement;
	};

	const createStatements = common => ({
		...common,

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
		}) {
			let database;
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
			const userFunctions = functions.map(func => assignTemplates(templates.createFunction, func));
			const userProcedures = procedures.map(procedure => assignTemplates(templates.createProcedure, procedure));
			return [database, ...userFunctions, ...userProcedures].join('\n');
		},

		createTable(tableData, isActivated) {
			const temporary = tableData.temporary ? 'TEMPORARY ' : '';
			const asSelect = tableData.selectStatement;
			const schemaName = tableData.schemaName === '' ? 'public' : tableData.schemaName;
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
			});
		},
	});

	return createStatements;
};
