'use strict';

const helpers = require('../helpers');
const user = require('../../user');
const db = require('../../database');
const request = require('request');
const Career = module.exports;

Career.register = async (req, res) => {
    const userData = req.body;
    try {
        console.log("hi")
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
        const url = "https://ml-career-model.fly.dev/prediction"
        console.log(url)
        
        // Send POST request with userCareerData as JSON object
        try {
            const config = {
                method: 'POST',
                body: JSON.stringify(userCareerData),
                headers: {
                    'Accept': 'application/json',
                    'content-type': 'application/json',
                },
                dataType: 'json',
            }
            const response = await fetch(url, config)
            console.log(response)
            if (response.ok) {
                const json = await response.json()
                userCareerData.prediction = json.good_employee
                console.log(userCareerData.prediction)
                await user.setCareerData(req.uid, userCareerData, () => {
                    db.sortedSetAdd('users:career', req.uid, req.uid);
                    res.json({});
                });
            }
        } catch (error) {
            console.log(error)
            console.log("Could not send successful HTTPS request")
        }
    } catch (err) {
        console.log(err);
        helpers.noScriptErrors(req, res, err.message, 400);
    }
};
