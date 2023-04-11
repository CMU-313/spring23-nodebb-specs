'use strict';

const helpers = require('../helpers');
const user = require('../../user');
const db = require('../../database');
const request = require('request');
const Career = module.exports;

Career.register = async (req, res) => {
    const userData = req.body;
    try {
        const userCareerData = {
            student_id: userData.student_id,
            major: userData.major,
            age: userData.age,
            gender: userData.gender,
            gpa: userData.gpa,
            extra_curricular: userData.extra_curricular,
            num_programming_languages: userData.num_programming_languages,
            num_past_internships: userData.num_past_internships,
        };
        // What URL should look like: ???/prediction/student1/computer_science/20/m/40/mens_basketball/1/2
        const domain = "http://0.0.0.0:8080"
        let url = domain + '/prediction/' + userCareerData.student_id + '/' + userCareerData.major.replace(/ /g,"_") + '/' + userCareerData.age +  '/' + userCareerData.gender + '/' + userCareerData.gpa.replace('.',"?") + '/' + userCareerData.extra_curricular.replace(/ /g,"_").replace("'","") + '/' + userCareerData.num_programming_languages + '/' + userCareerData.num_past_internships
        url = url.toLowerCase()
        await request(url, { json: true }, 
        async (err, response, body) => {
            if (err) {
                throw err
            }
            // console.log(response)
            // console.log(body)
            // console.log(body["good_employee"])
            // console.log(body.good_employee)
            userCareerData.prediction = body.good_employee
            await user.setCareerData(req.uid, userCareerData, () => {
                db.sortedSetAdd('users:career', req.uid, req.uid);
                res.json({});
            });
            // db.sortedSetAdd('users:career', req.uid, req.uid);
            // res.json({});
        });    
        // console.log(userCareerData)
        // // userCareerData.prediction = Math.round(Math.random()); // TODO: Change this line to do call and retrieve actual candidate success prediction from the model instead of using a random number
        // await user.setCareerData(req.uid, userCareerData);
        // db.sortedSetAdd('users:career', req.uid, req.uid);
        // res.json({});
    } catch (err) {
        console.log(err);
        helpers.noScriptErrors(req, res, err.message, 400);
    }
};
