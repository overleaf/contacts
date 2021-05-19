/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// Usage: coffee preprocess.coffee projects.json done.csv
// where projects.json is the output of 
// mongoexport <CREDENTIALS> --db sharelatex-staging --collection projects --type=json --fields owner_ref,collaberator_refs,readOnly_refs --query '{ $or: [{collaberator_refs: { $not : {$size: 0} }}, {readOnly_refs: { $not: {$size: 0}}}]}'

let contact_id, owner_id, project_id;
const fs = require("fs");

let projects = fs.readFileSync(process.argv[2]).toString();
projects = projects.split("\n").filter(p => p!=="").map(p => JSON.parse(p));

const contact_pairs = [];
for (let project of Array.from(projects)) {
	project_id = project._id.$oid;
	owner_id = project.owner_ref.$oid;
	const contact_ids = project.collaberator_refs.concat(project.readOnly_refs).map(r => r.$oid);
	for (contact_id of Array.from(contact_ids)) {
		contact_pairs.push([project_id, owner_id, contact_id]);
	}
}

// Done list is a list of pairs owner_id:contact_id
const DONE_FILE = process.argv[3];
const done_list = fs.readFileSync(DONE_FILE).toString();
const done_contacts = {};
for (let done_pair of Array.from(done_list.split("\n"))) {
	done_contacts[done_pair] = true;
}

const workers = [];
for (let contact_pair of Array.from(contact_pairs)) {
	((contact_pair => workers.push(function(cb) {
        if (done_contacts[contact_pair.join(":")]) {
            console.log("ALREADY DONE", contact_pair.join(":"), "SKIPPING");
            return cb();
        } else {
            [project_id, owner_id, contact_id] = Array.from(contact_pair);
            console.log(`PINGING CONTACT API (OWNER: ${owner_id}, CONTACT: ${contact_id})...`);
            return require("request").post({
                url: `http://localhost:3036/user/${owner_id}/contacts`,
                json: { contact_id }
            }, function(error, response, body) {
                if (error != null) { return cb(error); }
                if (response.statusCode !== 204) {
                    return cb(new Error(`bad status code: ${response.statusCode}`));
                }
                console.log("DONE, WRITING TO DONE FILE...");
                return fs.appendFile(DONE_FILE, contact_pair.join(":") + "\n", function(error) {
                    if (error != null) { return cb(error); }
                    console.log("WRITTEN");
                    return cb();
                });
            });
        }
    })))(contact_pair);
}

require("async").series(workers, function(error) {
	if (error != null) { console.error(error); }
	return console.log("DONE");
});