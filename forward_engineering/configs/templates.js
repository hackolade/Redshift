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
		'${tableAttributes};\n',
	createTableAs: 'CREATE ${temporary}TABLE "${schemaName}"."${name}" ${backup}${tableAttribute} AS ${query};\n',

	createView:
		'CREATE${orReplace} VIEW "${schemaName}"."${name}"(\n' +
		'\t${column_list}\n' +
		')\nAS SELECT ${table_columns}\nFROM "${table_name}"${withNoSchema};\n',
	createMaterializedView:
		'CREATE MATERIALIZED VIEW "${schemaName}"."${name}"${backup}${tableAttributes}${autoRefresh}\nAS SELECT ${table_columns}\nFROM "${table_name}";\n',

	createFunction:
		'CREATE${orReplace}FUNCTION "${name}" (${arguments})\n\tRETURNS ${returnDataType}\n${volatility}\nAS $$\n${statement}\n$$ LANGUAGE ${language};\n',
	createProcedure:
		'CREATE${orReplace}PROCEDURE "${name}" (${arguments})\nAS $$\n${statement}\n$$ LANGUAGE plpgsql${securityMode}${configurationParameter};\n',

	columnDefinition:
		'"${name}" ${type}${default}${encoding}${distKey}${sortKey}${notNull}${unique}${primaryKey}${inlineConstraints}${references}',

	compoundSortKey: '${sortStyle} SORTKEY (${keys})',
	compoundUniqueKey: 'UNIQUE (${keys})',
	compoundPrimaryKey: 'PRIMARY KEY (${keys})',
	createTableForeignKey: 'FOREIGN KEY (${columns}) REFERENCES ${primary_table} (${primary_columns})',
};
