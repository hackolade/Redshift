module.exports = app => {
	const _ = app.require('lodash');
	const { mapProperties } = app.require('@hackolade/ddl-fe-utils');
	const ddlProvider = require('../../ddlProvider')(null, null, app);
	const { getCompositeName } = require('../general')(app);

	const getAddViewScript = view => {
		const viewSchema = { ...view, ...(view.role ?? {}) };
		const dbData = { name: viewSchema.compMod.keyspaceName };

		const viewData = {
			name: viewSchema.code || viewSchema.name,
			keys: getKeys(viewSchema, viewSchema.compMod?.collectionData?.collectionRefsDefinitionsMap ?? {}),
			dbData,
		};
		const hydratedView = ddlProvider.hydrateView({ viewData, entityData: [viewSchema] });

		return ddlProvider.createView(hydratedView, dbData, view.isActivated);
	};

	const getDeleteViewScript = view => {
		const viewName = getCompositeName(view.code || view.name, view?.role?.compMod?.keyspaceName);

		return ddlProvider.dropView(viewName);
	};

	const getModifiedViewScript = view => {
		const viewSchema = { ...view, ...(view.role ?? {}), orReplace: true };
		const dbData = { name: viewSchema.compMod.keyspaceName };

		const viewData = {
			name: viewSchema.code || viewSchema.name,
			keys: getKeys(viewSchema, viewSchema.compMod?.collectionData?.collectionRefsDefinitionsMap ?? {}),
			dbData,
		};
		const hydratedView = ddlProvider.hydrateView({ viewData, entityData: [viewSchema] });

		return ddlProvider.createView(hydratedView, dbData, view.isActivated);
	};

	const getKeys = (viewSchema, collectionRefsDefinitionsMap) => {
		return mapProperties(viewSchema, (propertyName, schema) => {
			const definition = collectionRefsDefinitionsMap[schema.refId];

			if (!definition) {
				return ddlProvider.hydrateViewColumn({
					name: propertyName,
					isActivated: schema.isActivated,
				});
			}

			const entityName =
				_.get(definition.collection, '[0].code', '') ||
				_.get(definition.collection, '[0].collectionName', '') ||
				'';
			const dbName = _.get(definition.bucket, '[0].code') || _.get(definition.bucket, '[0].name', '');
			const name = definition.name;

			if (name === propertyName) {
				return ddlProvider.hydrateViewColumn({
					containerData: definition.bucket,
					entityData: definition.collection,
					isActivated: schema.isActivated,
					definition: definition.definition,
					entityName,
					name,
					dbName,
				});
			}

			return ddlProvider.hydrateViewColumn({
				containerData: definition.bucket,
				entityData: definition.collection,
				isActivated: schema.isActivated,
				definition: definition.definition,
				alias: propertyName,
				entityName,
				name,
				dbName,
			});
		});
	};

	return {
		getAddViewScript,
		getDeleteViewScript,
		getModifiedViewScript,
	};
};
