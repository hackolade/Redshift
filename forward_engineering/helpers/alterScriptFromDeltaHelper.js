const getComparisonModelCollection = collections => {
	return collections
		.map(collection => JSON.parse(collection))
		.find(collection => collection.collectionName === 'comparisonModelCollection');
};

const getContainersScripts = (collection, mode, getScript) => {
	const containers = collection.properties?.containers?.properties?.[mode]?.items;

	return []
		.concat(containers)
		.filter(Boolean)
		.map(container => ({
			...Object.values(container.properties)[0],
			...(Object.values(container.properties)[0]?.role ?? {}),
			name: Object.keys(container.properties)[0],
		}))
		.map(getScript);
};

const getAlterContainersScripts = (collection, app) => {
	const { getAddContainerScript, getDeleteContainerScript, getModifyContainerScript } =
		require('./alterScriptHelpers/alterContainerHelper')(app);

	const addContainersScripts = getContainersScripts(collection, 'added', getAddContainerScript);
	const deleteContainersScripts = getContainersScripts(collection, 'deleted', getDeleteContainerScript);
	const modifiedContainersScripts = getContainersScripts(collection, 'modified', getModifyContainerScript);

	return [].concat(addContainersScripts).concat(deleteContainersScripts).concat(modifiedContainersScripts);
};

const getAlterCollectionsScripts = (collection, app) => {
	const {
		getAddCollectionScript,
		getDeleteCollectionScript,
		getAddColumnScript,
		getDeleteColumnScript,
		getModifyCollectionScript,
	} = require('./alterScriptHelpers/alterEntityHelper')(app);

	const createCollectionsScripts = []
		.concat(collection.properties?.entities?.properties?.added?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.filter(collection => collection.compMod?.created)
		.map(getAddCollectionScript);
	const deleteCollectionScripts = []
		.concat(collection.properties?.entities?.properties?.deleted?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.filter(collection => collection.compMod?.deleted)
		.map(getDeleteCollectionScript);
	const addColumnScripts = []
		.concat(collection.properties?.entities?.properties?.added?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.filter(collection => !collection.compMod?.created)
		.flatMap(getAddColumnScript);
	const deleteColumnScripts = []
		.concat(collection.properties?.entities?.properties?.deleted?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.filter(collection => !collection.compMod?.deleted)
		.flatMap(getDeleteColumnScript);
	const modifyCollectionScripts = []
		.concat(collection.properties?.entities?.properties?.modified?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.map(getModifyCollectionScript);

	return [
		...deleteCollectionScripts,
		...deleteColumnScripts,
		...createCollectionsScripts,
		...addColumnScripts,
		...modifyCollectionScripts,
	].map(script => script.trim());
};

const getAlterViewScripts = (collection, app) => {
	const { getAddViewScript, getDeleteViewScript, getModifiedViewScript } =
		require('./alterScriptHelpers/alterViewHelper')(app);

	const createViewsScripts = []
		.concat(collection.properties?.views?.properties?.added?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.map(view => ({ ...view, ...(view.role || {}) }))
		.filter(view => view.compMod?.created)
		.map(getAddViewScript);

	const deleteViewsScripts = []
		.concat(collection.properties?.views?.properties?.deleted?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.map(view => ({ ...view, ...(view.role || {}) }))
		.filter(view => view.compMod?.deleted)
		.map(getDeleteViewScript);

	const modifiedViewsScripts = []
		.concat(collection.properties?.views?.properties?.modified?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.map(view => ({ ...view, ...(view.role || {}) }))
		.filter(view => !view.compMod?.created && !view.compMod?.deleted)
		.map(getModifiedViewScript);

	return [...deleteViewsScripts, ...createViewsScripts, ...modifiedViewsScripts].map(script => script.trim());
};

module.exports = {
	getComparisonModelCollection,
	getAlterContainersScripts,
	getAlterCollectionsScripts,
	getAlterViewScripts,
};
