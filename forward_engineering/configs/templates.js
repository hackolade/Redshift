module.exports = {
	createDatabase: '',
	createSchema: 'CREATE SCHEMA${ifNotExist} "${name}"${authorization}${quota};\n',
	createExternalSchema:
		'CREATE EXTERNAL SCHEMA${ifNotExist} "${name}" FROM ${source} DATABASE "${sourceDBName}"${sourceSchemaName}${region}${uri} IAM_ROLE "${iamRole}"${secretARN}${catalogRole}${createExternalDatabase};\n',

	createTable:
		'CREATE ${temporary}TABLE' +
		'${ifNotExist} "${schemaName}"."${name}"(' +
		'${columnDefinitions}' +
		'${tableConstraints}${likeStatement})' +
		'${tableAttributes};\n' +
		'${comment}${columnDescriptions}',
	createTableAs:
		'CREATE ${temporary}TABLE "${schemaName}"."${name}" ${backup}${tableAttribute} AS ${query};\n${comment}${columnDescriptions}',

	createView:
		'CREATE${orReplace} VIEW "${schemaName}"."${name}"(\n' +
		'\t${column_list}\n' +
		')\nAS SELECT ${table_columns}\nFROM "${table_name}"${withNoSchema};\n' +
		'${comment}',
	createMaterializedView:
		'CREATE MATERIALIZED VIEW "${schemaName}"."${name}"${backup}${tableAttributes}${autoRefresh}\nAS SELECT ${table_columns}\nFROM "${table_name}";\n${comment}',

	createFunction:
		'CREATE${orReplace}FUNCTION ${name} (${arguments})\n\tRETURNS ${returnDataType}\n${volatility}\nAS $$\n${statement}\n$$ LANGUAGE ${language};\n',
	createProcedure:
		'CREATE${orReplace}PROCEDURE ${name} (${arguments})\nAS $$\n${statement}\n$$ LANGUAGE plpgsql${securityMode}${configurationParameter};\n',

	columnDefinition:
		'"${name}" ${type}${default}${encoding}${distKey}${sortKey}${notNull}${unique}${primaryKey}${inlineConstraints}${references}',

	compoundSortKey: '${sortStyle} SORTKEY (${keys})',
	compoundUniqueKey: 'UNIQUE (${keys})',
	compoundPrimaryKey: 'PRIMARY KEY (${keys})',
	createTableForeignKey: 'FOREIGN KEY (${columns}) REFERENCES ${primary_table} (${primary_columns})',

	dropSchema: 'DROP SCHEMA IF EXISTS ${name};',
	alterSchema: 'ALTER SCHEMA ${name}${quota};',

	dropFunction: 'DROP FUNCTION ${name} (${arguments});',
	dropProcedure: 'DROP PROCEDURE ${name} (${arguments});',

	dropTable: 'DROP TABLE IF EXISTS ${name};',
	alterDistKey: 'ALTER TABLE ${name} ALTER ${distConstraint};',
	alterSortKey: 'ALTER TABLE ${name} ALTER ${sortKeyConstraint};',
	alterPrimaryKey: 'ALTER TABLE ${name} ADD ${primaryKeyConstraint};',
	alterUnique: 'ALTER TABLE ${name} ADD ${uniqueConstraint};',

	renameColumn: 'ALTER TABLE ${tableName} RENAME COLUMN "${oldColumnName}" TO "${newColumnName}";',
	alterColumnType: 'ALTER TABLE ${tableName} ALTER COLUMN "${columnName}" TYPE ${type};',
	addColumn: 'ALTER TABLE ${tableName} ADD COLUMN ${columnStatement};',
	dropColum: 'ALTER TABLE ${tableName} DROP COLUMN "${columnName}";',

	dropView: 'DROP VIEW IF EXISTS ${name};',

	comment: '\nCOMMENT ON ${object} ${objectName} IS ${comment};\n',
};
