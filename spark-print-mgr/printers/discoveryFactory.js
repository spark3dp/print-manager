var DiscoveryFactory = function(){
    this.discovery = {};
};

DiscoveryFactory.prototype.create = function (discovery){
    this.discovery[discovery] = this.discovery[discovery] || require('./' + discovery + 'Discovery.js');
    return this.discovery[discovery];
}

module.exports = new DiscoveryFactory();