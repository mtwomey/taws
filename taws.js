let AWS = require('aws-sdk');

function config(awsConfig){
    AWS.config = new AWS.Config(awsConfig);
}

function getAWSInfo() {
    return Promise.all([new AWS.EC2().describeInstances().promise(), new AWS.AutoScaling().describeAutoScalingGroups().promise()])
        .then(results => {
            return Promise.resolve({
                reservations: results[0].Reservations,
                autoScalingGroups: results[1].AutoScalingGroups
            });
        });
}

function getInstancesById(instanceIds, awsData) {
    let instances = [];
    awsData.reservations.forEach(reservation => {
        reservation.Instances.forEach(instance => {
            if (instanceIds.includes(instance.InstanceId))
                instances.push(instance);
        });
    })
    return instances;
}

function getInstanceById(instanceId, awsData) {
    return getInstancesById([instanceId], awsData)
}

module.exports = {
    getAWSInfo: getAWSInfo,
    getInstancesById: getInstancesById,
    getInstanceById: getInstanceById,
    config: config
};