/**
 * @typedef {import('../types').ColumnDefinition} ColumnDefinition
 * @typedef {import('../types').ConstraintDtoColumn} ConstraintDtoColumn
 * @typedef {import('../types').ConstraintDto} ConstraintDto
 * @typedef {import('../types').JsonSchema} JsonSchema
 */

const _ = require('lodash');

module.exports = app => {
	const { foreignKeysToString, foreignActiveKeysToString } = require('./general')(app);
	const assignTemplates = app.require('@hackolade/ddl-fe-utils').assignTemplates;

	const generateConstraint = (keys, template, isParentActivated, options = {}) => {
		const keysAsStrings = keys.map(key => ({ ...key, name: `"${key.name}"` }));
		const atLeastOneActive = keysAsStrings.some(key => key.isActivated);
		let finalStringOfKeys = foreignActiveKeysToString(keysAsStrings);
		if (atLeastOneActive && isParentActivated) {
			finalStringOfKeys = foreignKeysToString(keysAsStrings);
		}
		const statement = assignTemplates(template, {
			...options,
			keys: finalStringOfKeys,
		});

		return {
			statement,
			isActivated: atLeastOneActive,
		};
	};

	/**
	 * @param {ColumnDefinition} columnDefinition
	 * @returns {boolean}
	 */
	const isPrimaryKey = columnDefinition => {
		return !columnDefinition.compositePrimaryKey && columnDefinition.primaryKey;
	};

	/**
	 * @param {ColumnDefinition} columnDefinition
	 * @returns {boolean}
	 */
	const isUniqueKey = columnDefinition => {
		return !columnDefinition.compositeUniqueKey && columnDefinition.unique;
	};

	/**
	 * @param {string} keyId
	 * @param {Record<string, JsonSchema>} properties
	 * @returns {string}
	 */
	const findName = (keyId, properties) => {
		return Object.keys(properties).find(name => properties[name].GUID === keyId);
	};

	/**
	 * @param {string} keyId
	 * @param {Record<string, JsonSchema>} properties
	 * @returns {boolean}
	 */
	const checkIfActivated = (keyId, properties) => {
		return _.get(
			Object.values(properties).find(prop => prop.GUID === keyId),
			'isActivated',
			true,
		);
	};

	/**
	 * @param {Array<{ keyId: string }>} keys
	 * @param {JsonSchema} jsonSchema
	 * @returns {ConstraintDtoColumn}
	 */
	const getKeys = (keys, jsonSchema) => {
		return _.map(keys, key => {
			return {
				name: findName(key.keyId, jsonSchema.properties),
				isActivated: checkIfActivated(key.keyId, jsonSchema.properties),
			};
		});
	};

	/**
	 * @param {{ jsonSchema: JsonSchema }}
	 * @returns {ConstraintDto[]}
	 */
	const getCompositePrimaryKeys = ({ jsonSchema }) => {
		if (!Array.isArray(jsonSchema.primaryKey)) {
			return [];
		}

		return jsonSchema.primaryKey
			.filter(primaryKey => !_.isEmpty(primaryKey.compositePrimaryKey))
			.map(primaryKey => ({
				keyType: 'PRIMARY KEY',
				columns: getKeys(primaryKey.compositePrimaryKey, jsonSchema),
			}));
	};

	/**
	 * @param {{ jsonSchema: JsonSchema }}
	 * @returns {ConstraintDto[]}
	 */
	const getCompositeUniqueKeys = ({ jsonSchema }) => {
		if (!Array.isArray(jsonSchema.uniqueKey)) {
			return [];
		}

		return jsonSchema.uniqueKey
			.filter(uniqueKey => !_.isEmpty(uniqueKey.compositeUniqueKey))
			.map(uniqueKey => ({
				keyType: 'UNIQUE',
				columns: getKeys(uniqueKey.compositeUniqueKey, jsonSchema),
			}));
	};

	/**
	 * @param {{ columnDefinition: ColumnDefinition }}
	 * @returns {ConstraintDto | undefined}
	 */
	const getPrimaryKeyConstraint = ({ columnDefinition }) => {
		if (!isPrimaryKey(columnDefinition)) {
			return;
		}

		return {
			keyType: 'PRIMARY KEY',
		};
	};

	/**
	 * @param {{ columnDefinition: ColumnDefinition }}
	 * @returns {ConstraintDto | undefined}
	 */
	const getUniqueKeyConstraint = ({ columnDefinition }) => {
		if (!isUniqueKey(columnDefinition)) {
			return;
		}

		return {
			keyType: 'UNIQUE',
		};
	};

	const getCompositeKeyConstraints = ({ jsonSchema }) => {
		const compositePrimaryKeys = getCompositePrimaryKeys({ jsonSchema });
		const compositeUniqueKeys = getCompositeUniqueKeys({ jsonSchema });

		return [...compositePrimaryKeys, ...compositeUniqueKeys];
	};

	/**
	 * @param {{ columnDefinition: ColumnDefinition }}
	 * @returns {ConstraintDto[]}
	 */
	const getColumnConstraints = ({ columnDefinition }) => {
		const primaryKeyConstraint = getPrimaryKeyConstraint({ columnDefinition });
		const uniqueKeyConstraint = getUniqueKeyConstraint({ columnDefinition });

		return [primaryKeyConstraint, uniqueKeyConstraint].filter(Boolean);
	};

	return {
		generateConstraint,
		getCompositeKeyConstraints,
		getColumnConstraints,
	};
};
