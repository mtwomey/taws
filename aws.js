const { execSync } = require('child_process');
const _ = require('lodash');
let fs = require('fs');

reportInstanceIpsByAutoScalingGroup();

function reportInstanceIpsByAutoScalingGroup(){
    let asgs = getAutoScalingGroups();
    let instances = getInstances();
    asgs.forEach((asg) => {
        console.log(`*** ${asg.AutoScalingGroupName} *** (LC: ${asg.LaunchConfigurationName})`);
        asg.Instances.forEach(asgInstance => {
            process.stdout.write(asgInstance.InstanceId)
            let instance = _.find(instances, (instance => {
                return _.find(instance.Instances, dinstance => {
                    return (dinstance.InstanceId === asgInstance.InstanceId)
                })
            }));
            if (instance){
                let subInstance = _.find(instance.Instances, dinstance => {
                    return (dinstance.InstanceId === asgInstance.InstanceId)
                });
                let ipAddress = subInstance.PrivateIpAddress;
                let keyName = subInstance.KeyName;
                process.stdout.write(`: ${ipAddress} (ssh -i "${keyName}.pem" ec2-user@${ipAddress})\n`);
            } else {
                process.stdout.write(': \n');
            }
        });
        console.log('');
    })
}

function getInstances(){
    return JSON.parse(execSync('aws ec2 describe-instances')).Reservations;
}

function getAutoScalingGroups(){
    return JSON.parse(execSync('aws autoscaling describe-auto-scaling-groups')).AutoScalingGroups;
}

function getInstancesById(ids){
    return JSON.parse(execSync(`aws ec2 describe-instances --instance-ids ${ids.join(' ')}`)).Reservations
}

function findAutoScalingGroupByName(name) {
    let filteredASGs = _.filter(getAutoScalingGroups(), (asg) => {
        return (asg.AutoScalingGroupName.search(name) !== -1);
    });
    if (filteredASGs.length > 1) {
        throw {message: 'More than one group found', data: JSON.stringify(filteredASGs)};
    }
    if (filteredASGs.length < 1) {
        throw {message: 'No AutoScalingGroups found', data: ''};
    }
    return filteredASGs[0];
}

function findAutoScalingGroupByNameInstances(name){
    let asg;
    try {
        asg = findAutoScalingGroupByName(name)
    } catch (error) {
        console.log('Error');
        console.log(error.message);
        console.log(error.data);
        process.exit();
    }
    let instanceIds = asg.Instances.map((i) => {return i.InstanceId});
    return getInstancesById(instanceIds).map((i) => {return i.Instances[0].PrivateIpAddress});
    let x = 10;
}