module.exports = app => {
	const _ = app.require('lodash');
	const { checkAllKeysActivated } = app.require('@hackolade/ddl-fe-utils').general;
	const commentIfDeactivated = require('./commentDeactivatedHelper')(app);

	const escape = value => String(value).replace(/\'/g, "''").replace(/\\\\/g, '\\').replace(/\\/g, '\\\\');
	const toString = value => (_.isUndefined(value) ? value : `'${escape(value)}'`);
	const isNone = value => _.toLower(value) === 'none';
	const isAuto = value => _.toLower(value) === 'auto';
	const toStringIfNotNone = value => (isNone(value) ? value : toString(value));
	const toStringIfNotAuto = value => (isAuto(value) ? value : toString(value));
	const toNumber = value => (isNaN(value) ? '' : Number(value));
	const toBoolean = value => (value === true ? 'TRUE' : 'FALSE');
	const toOptions = options => {
		return Object.entries(options)
			.filter(([optionName, value]) => !_.isEmpty(value) || value !== false)
			.map(([optionName, value]) => {
				if (Array.isArray(value)) {
					value = '(' + value.filter(value => !_.isEmpty(value)).join(', ') + ')';
				}

				return `${optionName}=${value}`;
			})
			.join('\n');
	};

	const findJsonSchemaChain = (keyId, jsonSchema, name) => {
		if (jsonSchema.GUID === keyId) {
			return [{ ...jsonSchema, name }];
		} else if (_.isPlainObject(jsonSchema.properties)) {
			const nestedName = Object.keys(jsonSchema.properties).reduce((result, name) => {
				if (result.length) {
					return result;
				}
				const nestedName = findJsonSchemaChain(keyId, jsonSchema.properties[name], name);

				if (nestedName) {
					return result.concat(nestedName);
				}

				return result;
			}, []);

			if (nestedName.length) {
				return [{ ...jsonSchema, name }].concat(nestedName);
			}
		} else if (_.isArray(jsonSchema.items)) {
			const nestedName = jsonSchema.items.reduce((result, schema) => {
				if (result.length) {
					return result;
				}
				const nestedName = findJsonSchemaChain(keyId, schema, '');

				if (nestedName) {
					return result.concat(nestedName);
				}

				return result;
			}, []);

			if (nestedName.length) {
				return [{ ...jsonSchema, name }].concat(nestedName);
			}
		} else if (jsonSchema.items) {
			const nestedName = findJsonSchemaChain(keyId, jsonSchema.items, '');

			if (nestedName) {
				return [{ ...jsonSchema, name }].concat(nestedName);
			}
		}
	};

	const foreignKeysToString = keys => {
		if (Array.isArray(keys)) {
			const splitter = ', ';
			let deactivatedKeys = [];
			const processedKeys = keys
				.reduce((keysString, key) => {
					const keyName = _.isString(key.name) ? key.name.trim() : key.trim();

					if (!_.get(key, 'isActivated', true)) {
						deactivatedKeys.push(keyName);

						return keysString;
					}

					return [...keysString, keyName];
				}, [])
				.filter(Boolean);

			if (processedKeys.length === 0) {
				return commentIfDeactivated(deactivatedKeys.join(splitter), { isActivated: false }, true);
			} else if (deactivatedKeys.length === 0) {
				return processedKeys.join(splitter);
			} else {
				return (
					processedKeys.join(splitter) +
					commentIfDeactivated(splitter + deactivatedKeys.join(splitter), { isActivated: false }, true)
				);
			}
		}
		return keys;
	};

	const foreignActiveKeysToString = keys => {
		return keys.map(key => key.name.trim()).join(', ');
	};

	const checkIfForeignKeyActivated = fkData =>
		checkAllKeysActivated(fkData.foreignKey) &&
		checkAllKeysActivated(fkData.primaryKey) &&
		fkData.primaryTableActivated &&
		fkData.foreignTableActivated;

	const viewColumnsToString = (keys, isParentActivated) => {
		if (!isParentActivated) {
			return keys.map(key => key.name).join(',\n\t');
		}

		let activatedKeys = keys.filter(key => key.isActivated).map(key => key.name);
		let deactivatedKeys = keys.filter(key => !key.isActivated).map(key => key.name);

		if (activatedKeys.length === 0) {
			return commentIfDeactivated(deactivatedKeys.join(',\n\t'), { isActivated: false }, true);
		}
		if (deactivatedKeys.length === 0) {
			return activatedKeys.join(',\n\t');
		}

		return (
			activatedKeys.join(',\n\t') +
			'\n\t' +
			commentIfDeactivated(deactivatedKeys.join(',\n\t'), { isActivated: false }, true)
		);
	};

	return {
		toString,
		toNumber,
		toBoolean,
		toOptions,
		toStringIfNotNone,
		toStringIfNotAuto,
		foreignKeysToString,
		checkIfForeignKeyActivated,
		foreignActiveKeysToString,
		viewColumnsToString,
	};
};
