const _ = require('lodash');

const checkFieldPropertiesChanged = (compMod, propertiesToCheck) => {
	return propertiesToCheck.some(prop => compMod?.oldField[prop] !== compMod?.newField[prop]);
};

const modifyGroupItems = ({ data, key, hydrate, drop, create, filter = Boolean }) => {
	const compMod = getCompMod(data);
	const parentName = data.code || data.name || data.collectionName;

	const { removed, added, modified } = getModifiedGroupItems(compMod[key] || {}, hydrate, filter);

	const removedScripts = removed.map(item => drop(item, parentName));
	const addedScripts = added.map(item => create(item, parentName));
	const modifiedScripts = modified.map(item => create({ ...item, orReplace: true }, parentName));

	return [].concat(modifiedScripts).concat(removedScripts).concat(addedScripts).filter(Boolean).join('\n\n');
};

const getModifiedGroupItems = ({ new: newItems = [], old: oldItems = [] }, hydrate, filter) => {
	const oldHydrated = oldItems.map(hydrate).filter(filter);
	const newHydrated = newItems.map(hydrate).filter(filter);

	const { removed, added, modified } = oldHydrated.reduce(
		(accumulator, oldItem) => {
			const newItem = newHydrated.find(item => item.name === oldItem.name);
			const itemsAreNotEqual = !isGroupItemsEqual(newItem, oldItem);

			if (!newItem) {
				return {
					removed: [...accumulator.removed, oldItem],
					modified: accumulator.modified,
					added: accumulator.added,
				};
			}

			if (itemsAreNotEqual) {
				return {
					removed: accumulator.removed,
					modified: [...accumulator.modified, newItem],
					added: accumulator.added,
				};
			}

			return accumulator;
		},
		{
			removed: [],
			modified: [],
			added: newHydrated.filter(newItem => !oldHydrated.some(item => item.name === newItem.name)),
		},
	);

	return { removed, added, modified };
};

const isGroupItemsEqual = (leftItem, rightItem) => _.isEqual(leftItem, rightItem);

const getCompMod = containerData => containerData.role?.compMod ?? {};

const checkCompModEqual = ({ new: newItem, old: oldItem } = {}) => _.isEqual(newItem, oldItem);

const setTableKeys = (idToNameHashTable, idToActivatedHashTable, table) => {
	return {
		...table,
		distKey: [
			{
				...(table.distKey?.[0] ?? {}),
				compositeDistKey:
					table.distKey?.[0]?.compositeDistKey?.map(key => ({
						...key,
						name: idToNameHashTable[key.keyId],
						isActivated: idToActivatedHashTable[key.keyId],
					})) || [],
			},
		],
		sortKey: [
			{
				...(table.sortKey?.[0] ?? {}),
				compositeSortKey:
					table.sortKey?.[0]?.compositeSortKey?.map(key => ({
						...key,
						name: idToNameHashTable[key.keyId],
						isActivated: idToActivatedHashTable[key.keyId],
					})) || [],
			},
		],
		primaryKey: [
			{
				...(table.primaryKey?.[0] ?? {}),
				compositePrimaryKey:
					table.primaryKey?.[0]?.compositePrimaryKey?.map(key => ({
						...key,
						name: idToNameHashTable[key.keyId],
						isActivated: idToActivatedHashTable[key.keyId],
					})) || [],
			},
		],
		uniqueKey: [
			{
				...(table.uniqueKey?.[0] ?? {}),
				compositeUniqueKey:
					table.uniqueKey?.[0]?.compositeUniqueKey?.map(key => ({
						...key,
						name: idToNameHashTable[key.keyId],
						isActivated: idToActivatedHashTable[key.keyId],
					})) || [],
			},
		],
	};
};

const getKeys = keys => _.map(keys, 'name');

const setNewProperties = jsonSchema => {
	const compMod = getCompMod(jsonSchema);

	return _.toPairs(compMod).reduce((jsonSchema, [key, compMod]) => {
		if (compMod.new) {
			return { ...jsonSchema, [key]: compMod.new };
		}

		return jsonSchema;
	}, jsonSchema);
};

module.exports = {
	checkFieldPropertiesChanged,
	getCompMod,
	modifyGroupItems,
	checkCompModEqual,
	setTableKeys,
	getKeys,
	setNewProperties,
};
