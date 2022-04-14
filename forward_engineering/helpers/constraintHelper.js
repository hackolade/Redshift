module.exports = app => {
	const { foreignKeysToString, foreignActiveKeysToString } = require('./general')(app);
	const assignTemplates = app.require('@hackolade/ddl-fe-utils').assignTemplates;
	
	const generateConstraint = (keys, template, isParentActivated, options = {}) => {
		const keysAsStrings = keys.map(key => Object.assign({}, key, { name: `"${key.name}"` }));
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
	
	return {
		generateConstraint,
	};
}
