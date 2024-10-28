const _ = require('lodash');
const { checkFieldPropertiesChanged, getCompMod, setTableKeys, getKeys, setNewProperties } = require('./common');
const { createColumnDefinitionBySchema } = require('./createColumnDefinition');

module.exports = app => {
	const {
		generateIdToNameHashTable,
		generateIdToActivatedHashTable,
		general: { getEntityName },
	} = app.require('@hackolade/ddl-fe-utils');

	const { getCompositeName } = require('../general')(app);
	const ddlProvider = require('../../ddlProvider')(null, null, app);

	const getAddCollectionScript = collection => {
		const dbName = collection.compMod.keyspaceName;
		const dbData = { name: dbName };
		const mergedCollection = { ...collection, ...(collection?.role || {}) };
		const tableName = getEntityName(mergedCollection);
		const idToNameHashTable = generateIdToNameHashTable(mergedCollection);
		const idToActivatedHashTable = generateIdToActivatedHashTable(mergedCollection);
		const jsonSchema = setTableKeys(idToNameHashTable, idToActivatedHashTable, mergedCollection);
		const columnDefinitions = _.toPairs(jsonSchema.properties).map(([name, column]) =>
			createColumnDefinitionBySchema({
				name,
				jsonSchema: column,
				parentJsonSchema: jsonSchema,
				ddlProvider,
			}),
		);
		const tableData = {
			name: tableName,
			columns: columnDefinitions.map(ddlProvider.convertColumnDefinition),
			foreignKeyConstraints: [],
			columnDefinitions,
			dbData,
		};

		const hydratedTable = ddlProvider.hydrateTable({
			tableData,
			entityData: [jsonSchema, jsonSchema],
			jsonSchema,
		});

		return ddlProvider.createTable(hydratedTable, jsonSchema.isActivated);
	};

	const getDeleteCollectionScript = collection => {
		const jsonSchema = { ...collection, ...(collection?.role || {}) };
		const tableName = getEntityName(jsonSchema);
		const dbName = collection.compMod.keyspaceName;
		const fullName = getCompositeName(tableName, dbName);

		return ddlProvider.dropTable(fullName);
	};

	const getModifyCollectionScript = collection => {
		const mergedCollection = { ...collection, ...(collection?.role || {}) };
		const dbName = mergedCollection.compMod?.keyspaceName;
		const dbData = { name: dbName };
		const idToNameHashTable = generateIdToNameHashTable(mergedCollection);
		const idToActivatedHashTable = generateIdToActivatedHashTable(mergedCollection);
		const jsonSchema = setTableKeys(idToNameHashTable, idToActivatedHashTable, setNewProperties(mergedCollection));
		const compMod = getCompMod(mergedCollection);

		const modifiedColumnScripts = getModifyColumnScript(collection);

		const isPrimaryKeyModified = !_.isEqual(
			getKeys(compMod.primaryKey?.old?.[0]?.compositePrimaryKey || []),
			getKeys(compMod.primaryKey?.new?.[0]?.compositePrimaryKey || []),
		);
		const isUniqueKeyModified = !_.isEqual(
			getKeys(compMod.uniqueKey?.old?.[0]?.compositeUniqueKey || []),
			getKeys(compMod.uniqueKey?.new?.[0]?.compositeUniqueKey || []),
		);
		const isDistKeyModified =
			!_.isEqual(
				getKeys(compMod.distKey?.old?.[0]?.compositeDistKey || []),
				getKeys(compMod.distKey?.new?.[0]?.compositeDistKey || []),
			) || compMod.DISTSTYLE?.old !== compMod.DISTSTYLE?.new;
		const isSortKeyModified =
			!_.isEqual(
				getKeys(compMod.sortKey?.old?.[0]?.compositeSortKey || []),
				getKeys(compMod.sortKey?.new?.[0]?.compositeSortKey || []),
			) ||
			compMod.autoSortKey?.old !== compMod.autoSortKey?.new ||
			compMod.sortStyle?.old !== compMod.sortStyle?.new;

		const modifyTableOptionsScript = ddlProvider.alterTableOptions(jsonSchema, dbData, {
			isPrimaryKeyModified,
			isUniqueKeyModified,
			isDistKeyModified,
			isSortKeyModified,
		});

		return _.concat([], modifiedColumnScripts, modifyTableOptionsScript).filter(Boolean).join('\n\n');
	};

	const getAddColumnScript = collection => {
		const collectionSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
		const tableName = collectionSchema?.code || collectionSchema?.collectionName || collectionSchema?.name;
		const dbName = collectionSchema.compMod?.keyspaceName;
		const fullName = getCompositeName(tableName, dbName);

		return _.toPairs(collection.properties)
			.filter(([name, jsonSchema]) => !jsonSchema.compMod)
			.map(([name, jsonSchema]) =>
				createColumnDefinitionBySchema({
					name,
					jsonSchema,
					parentJsonSchema: collectionSchema,
					ddlProvider,
				}),
			)
			.map(ddlProvider.convertColumnDefinition)
			.map(({ statement }) => ddlProvider.addColumn(fullName, statement));
	};

	const getDeleteColumnScript = collection => {
		const collectionSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
		const tableName = collectionSchema?.code || collectionSchema?.collectionName || collectionSchema?.name;
		const dbName = collectionSchema.compMod?.keyspaceName;
		const fullName = getCompositeName(tableName, dbName);

		return _.toPairs(collection.properties)
			.filter(([name, jsonSchema]) => !jsonSchema.compMod)
			.map(([name]) => ddlProvider.dropColumn(fullName, name));
	};

	const getModifyColumnScript = collection => {
		const collectionSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
		const tableName = getEntityName(collectionSchema);
		const dbName = collectionSchema.compMod?.keyspaceName;
		const fullName = getCompositeName(tableName, dbName);

		const renameColumnScripts = _.values(collection.properties)
			.filter(jsonSchema => checkFieldPropertiesChanged(jsonSchema.compMod, ['name']))
			.map(jsonSchema =>
				ddlProvider.renameColumn(fullName, jsonSchema.compMod.oldField.name, jsonSchema.compMod.newField.name),
			);

		const changeTypeScripts = _.toPairs(collection.properties)
			.filter(([name, jsonSchema]) => checkFieldPropertiesChanged(jsonSchema.compMod, ['type', 'mode']))
			.map(([name, jsonSchema]) => {
				const columnDefinition = createColumnDefinitionBySchema({
					name,
					jsonSchema,
					parentJsonSchema: collectionSchema,
					ddlProvider,
				});

				return ddlProvider.alterColumnType(fullName, columnDefinition);
			});

		return [...renameColumnScripts, ...changeTypeScripts];
	};

	return {
		getAddCollectionScript,
		getDeleteCollectionScript,
		getModifyCollectionScript,
		getAddColumnScript,
		getDeleteColumnScript,
	};
};
