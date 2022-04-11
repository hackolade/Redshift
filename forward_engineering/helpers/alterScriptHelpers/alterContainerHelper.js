module.exports = app => {
	const _ = app.require('lodash');
	const ddlProvider = require('../../ddlProvider')(null, null, app);
	const { getDbData, getDbName } = app.require('@hackolade/ddl-fe-utils').general;
	const { hydrateUdf, hydrateProcedure, filterUdf, filterProcedure } = require('../general')(app);
	const { modifyGroupItems } = require('./common')(app);

	const getAddContainerScript = containerData => {
		const constructedDbData = getDbData([containerData]);
		const schemaData = ddlProvider.hydrateDatabase(constructedDbData, {
			udfs: containerData.role?.UDFs,
			procedures: containerData.role?.Procedures,
		});

		return _.trim(ddlProvider.createDatabase(schemaData));
	};

	const getDeleteContainerScript = containerData => {
		const containerName = getDbData([containerData]).name;

		return ddlProvider.dropSchema(containerName);
	};

	const getModifyContainerScript = containerData => {
		const isQuotaModified =
			containerData.compMod.unlimitedQuota?.old !== containerData.compMod.unlimitedQuota?.new ||
			containerData.compMod.quota?.old !== containerData.compMod.quota?.new;

		const constructedDbData = getDbData([containerData]);
		const schemaData = ddlProvider.hydrateDatabase(constructedDbData, {
			udfs: containerData.role?.UDFs,
			procedures: containerData.role?.Procedures,
		});

		const alterSchemaScript = isQuotaModified ? ddlProvider.alterSchema(schemaData) : '';
		const alterUdfScripts = modifyUdf(containerData);
		const alterProcedureScripts = modifyProcedures(containerData);

		return [alterSchemaScript, alterUdfScripts, alterProcedureScripts].filter(Boolean).join('\n\n');
	};

	const modifyUdf = containerData =>
		modifyGroupItems({
			data: containerData,
			key: 'UDFs',
			hydrate: hydrateUdf(getDbName([containerData])),
			filter: filterUdf,
			create: ddlProvider.createUdf,
			drop: ddlProvider.dropUdf,
		});

	const modifyProcedures = containerData =>
		modifyGroupItems({
			data: containerData,
			key: 'Procedures',
			hydrate: hydrateProcedure(getDbName([containerData])),
			filter: filterProcedure,
			create: ddlProvider.createProcedure,
			drop: ddlProvider.dropProcedure,
		});

	return {
		getAddContainerScript,
		getDeleteContainerScript,
		getModifyContainerScript,
	};
};
