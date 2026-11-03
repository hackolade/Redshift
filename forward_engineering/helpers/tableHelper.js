const _ = require('lodash');
const { commentIfDeactivated } = require('./commentDeactivatedHelper');

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

	const [activatedForeignKeys, deactivatedForeignKeys] = _.partition(
		foreignKeyConstraints,
		constraint => constraint.isActivated !== false,
	);

	activatedForeignKeys.forEach(constraint => {
		constraints.push(constraint.statement);
	});

	const activatedConstraints = _.isEmpty(constraints) ? '' : ',\n\t' + constraints.join(',\n\t');
	const deactivatedConstraints = _.isEmpty(deactivatedForeignKeys)
		? ''
		: '\n\t' +
			commentIfDeactivated(
				', ' + deactivatedForeignKeys.map(constraint => constraint.statement).join(',\n\t'),
				{ isActivated: false },
				true,
			);

	return activatedConstraints + deactivatedConstraints;
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
