module.exports = app => {
	const templates = require('../configs/templates');
	const assignTemplates = app.require('@hackolade/ddl-fe-utils').assignTemplates;
	const commentIfDeactivated = require('./commentDeactivatedHelper')(app);
	const _ = app.require('lodash');
	const { toString } = require('./general')(app);

	const decorateType = (type, columnDefinition) => {
		type = _.toUpper(type);
		let resultType = type;

		if (isTimestamp(type)) {
			if (columnDefinition.timePrecision && !_.isNaN(columnDefinition.timePrecision)) {
				resultType = `${type}(${columnDefinition.timePrecision})`;
			}
		}

		if (['VARCHAR', 'CHAR', 'CHARACTER', 'VARBYTE'].includes(type)) {
			if (columnDefinition.length && !_.isNaN(columnDefinition.length)) {
				resultType = `${type}(${columnDefinition.length})`;
			}
		}

		if (['NUMBER', 'DECIMAL', 'NUMERIC'].includes(type)) {
			if (!_.isNaN(columnDefinition.scale) && !_.isNaN(columnDefinition.precision)) {
				resultType = `${type}(${Number(columnDefinition.precision)},${Number(columnDefinition.scale)})`;
			}
		}

		return resultType;
	};

	const isString = type =>
		['VARCHAR', 'NVARCHAR', 'TEXT', 'CHAR', 'CHARACTER VARYING', 'BPCHAR', 'CHARACTER', 'NCHAR'].includes(
			_.toUpper(type),
		);

	const isTimestamp = type => ['TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'TIMETZ'].includes(_.toUpper(type));

	const escapeString = str => str.replace(/^\'([\S\s]+)\'$/, '$1').replace(/\'/g, "''");

	const getDefault = (type, defaultValue) => {
		if (isString(type)) {
			return `'${escapeString(String(defaultValue))}'`;
		} else if (_.toUpper(type) === 'BOOLEAN') {
			return _.toUpper(defaultValue);
		} else {
			return defaultValue;
		}
	};

	const getQuota = (quotaSize, isUnlimited) => {
		if (isUnlimited) {
			return ' QUOTA UNLIMITED';
		}
		if (quotaSize) {
			return ` QUOTA ${quotaSize} MB`;
		}
		return '';
	};

	const getSourceSchemaNameForExternalSchema = (postgresSchemaName, redshiftSchemaName, source) => {
		const schemaRequiredSources = ['Redshift', 'Postgres'];
		const schemaName = postgresSchemaName || redshiftSchemaName;
		if (schemaName && schemaRequiredSources.includes(source)) {
			return ` SCHEMA "${schemaName}"`;
		}
		return '';
	};
	const getARN = (arn, source) => {
		const ARNRequiredSources = ['MYSQL', 'Postgres'];
		if (arn && ARNRequiredSources.includes(source)) {
			return ` SECRET_ARN ${arn}`;
		}
		return '';
	};

	const getUri = (uri, port, source) => {
		const uriRequiredSources = ['Hive metastore', 'Postgres', 'MYSQL'];
		if (!uriRequiredSources.includes(source)) {
			return '';
		}
		if (uri && port) {
			return ` URI ${uri} PORT ${port}`;
		} else if (uri) {
			return ` URI ${uri}`;
		}
		return '';
	};

	const getColumnComments = (tableName, columnDefinitions) => {
		return _.chain(columnDefinitions)
			.filter('comment')
			.map(columnData => {
				const comment = assignTemplates(templates.comment, {
					object: 'COLUMN',
					objectName: `${tableName}."${columnData.name}"`,
					comment: toString(columnData.comment),
				});

				return commentIfDeactivated(comment, columnData);
			})
			.join('')
			.value();
	};

	const createColumnsStatements = columns => columns.map(column => column.statement).join(',\n\t');

	const getColumnsDefinitions = (columns, isParentActivated) => {
		const [activatedColumns, deactivatedColumns] = _.partition(
			columns,
			column => !isParentActivated || column?.isActivated,
		);
		const activatedStatements = createColumnsStatements(activatedColumns);
		const deactivatedStatements = createColumnsStatements(deactivatedColumns);
		const isDeactivatedStatements = deactivatedStatements.length;
		const commentedDeactivatedStatements = isDeactivatedStatements
			? '\n\t' + commentIfDeactivated(deactivatedStatements, { isActivated: false }, true)
			: '';

		return `${activatedStatements}${commentedDeactivatedStatements}`;
	};

	return {
		getQuota,
		getSourceSchemaNameForExternalSchema,
		getUri,
		getARN,
		decorateType,
		getDefault,
		getColumnComments,
		getColumnsDefinitions,
	};
};
