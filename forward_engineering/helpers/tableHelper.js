module.exports = app => {
	const _ = app.require('lodash');

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

		if (compoundUniqueKey.statement) {
			constraints.push(compoundUniqueKey.statement);
		}

		if (compoundPrimaryKey.statement) {
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

	return {
		getTableAttributes,
		getTableConstraints,
		getTableLikeConstraint,
	};
};
