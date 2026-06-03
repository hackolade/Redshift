const _ = require('lodash');

const getTableAttributes = (distStyle, distKey, compoundSortKey) => {
	let attributes = [];

	if (distStyle !== '') {
		attributes.push(distStyle);
	}

	if (distKey !== '') {
		attributes.push(distKey);
	}
	if (compoundSortKey.statement) {
		attributes.push(compoundSortKey.statement);
	}

	return !_.isEmpty(attributes) ? '\n' + attributes.join('\n') : '';
};

const getTableConstraints = (backup, compoundUniqueKey, compoundPrimaryKey, foreignKeyConstraints) => {
	let constraints = [];

	if (backup) {
		constraints.push(backup);
	}

	if (compoundUniqueKey.statement && compoundUniqueKey.isActivated) {
		constraints.push(compoundUniqueKey.statement);
	}

	if (compoundPrimaryKey.statement && compoundPrimaryKey.isActivated) {
		constraints.push(compoundPrimaryKey.statement);
	}

	foreignKeyConstraints.forEach(constraint => {
		constraints.push(constraint.statement);
	});

	return !_.isEmpty(constraints) ? ',\n\t' + constraints.join(',\n\t') : '';
};

const getTableLikeConstraint = (likeTableName, includingDefault, needComma) => {
	if (likeTableName === '') {
		return '';
	}
	let likeStatement = `${needComma ? ',\n\t' : ''}LIKE ${likeTableName}`;
	if (includingDefault) {
		return likeStatement + ' INCLUDING DEFAULTS';
	}
	return likeStatement;
};

const formatIamRole = iamRole => {
	if (!iamRole) {
		return "''";
	}

	const normalizedRole = String(iamRole).trim();
	if (normalizedRole.toLowerCase() === 'default') {
		return 'default';
	}

	return `'${normalizedRole}'`;
};

module.exports = {
	getTableAttributes,
	getTableConstraints,
	getTableLikeConstraint,
	formatIamRole,
};
