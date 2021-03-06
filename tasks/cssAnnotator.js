"use strict"
var rework = require('rework');

var path = require('path');
var childProcess = require('child_process');
var phantomjs = require('phantomjs');
var binPath = phantomjs.path;
var Set = require('../lib/set');
var util = require('../lib/util');

var rw_plugins = require('../lib/rework_plugins');

function checkSelectors(urls, selectors, cb){
    var childArgs = [
        path.join(__dirname, '../phantomjs/','phantomjs-script.js'),
    ];

    var proc = childProcess.execFile(binPath, childArgs, function(err, stdout, stderr) {
        var re = /results:(.*)/, obj;
        var groups = stdout.match(re);
        if (groups){
            try{
                obj = JSON.parse(groups[1]);
            }
            catch (e){
                cb("error: can't parse results from phantomjs");
            }
            cb(undefined, obj);
        }
        else {
            cb("error: no results from phantom");
        }
    });

    proc.stdin.write(JSON.stringify({urls: urls, selectors: selectors}));
    proc.stdin.end();
}

module.exports = function(grunt) {

grunt.registerMultiTask("css-annotator", "attach a label to the css rules used in a group of pages", function (){
    var done = this.async();
    var urls = this.data.urls;
    var label = this.data.label;
    var doOverrideLabels = this.data.override;
    var dest = this.data.dest;
    var intersection = this.data.intersection;

    var asts = this.files.map(function (files){
        return files.src.map(function (f){
            var css = grunt.file.read(f);
            try{
                var ast = rework(css, { source: f });
            }
            catch (e){
                grunt.log.error(e);
                return;
            }
            return {name: f, ast: ast};

        });

    });

    asts = util.flatten(asts).filter(util.notEmpty);

    var selectors = new Set(util.getSelectors(asts)).toArray();

    grunt.log.ok("Original selectors:" + selectors.length);

    checkSelectors(this.data.urls, selectors, function (err,data){
        var s, selectors_array;
        if (err){
            grunt.log.error(err);
        }
        else {
            selectors_array = data.map(function (item){
                grunt.log.ok("Used selectors(" + item.url + "): " + item.sel.length);
                return new Set(item.sel);
            });

            if (intersection){
                s = util.intersection(selectors_array);
            }
            else {
                s = util.union(selectors_array);
            }

            grunt.log.ok("Used (" + (intersection && "intersection" || "union" ) + "): " + s.length());

            asts.forEach(function (ast){
                ast.ast.use(rw_plugins.getAnnotator(s, label, doOverrideLabels))
            });
             
            asts.forEach(function (ast){
                var d = dest && path.join(dest, ast.name) || ast.name;
                grunt.file.write(d, ast.ast.toString(/*{ sourcemap: true }*/));
            });
        }
        done();
    });

}); 

grunt.registerMultiTask("css-annotator-filter", "filter the css rules with a specific label", function (){
    var with_label_set = this.data.with_label && new Set(this.data.with_label);
    var without_label_set = this.data.without_label_set && new Set(this.data.without_label);
    var dest = this.data.dest;

    this.files.forEach(function (files){
        files.src.forEach(function (f){
            var css = grunt.file.read(f);
            try{
                var ast = rework(css, { source: f });
            }
            catch (e){
                grunt.log.error(e);
                return;
            }
            ast.use(rw_plugins.getFilterByAnnotation(with_label_set, without_label_set));
            grunt.file.write(path.join(dest, f), ast.toString(/*{ sourcemap: true }*/));

        });
    });


}); 

};


    