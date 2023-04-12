from fastapi import FastAPI, HTTPException
import joblib
import pandas as pd
from pydantic import BaseModel, Field
from pydantic.tools import parse_obj_as
from typing import Any

# Pydantic Models
class Student(BaseModel):
    student_id: str = Field(alias="Student ID")
    gender: str = Field(alias="Gender")
    age: str = Field(alias="Age")
    major: str = Field(alias="Major")
    gpa: str = Field(alias="GPA")
    extra_curricular: str = Field(alias="Extra Curricular")
    num_programming_languages: str = Field(alias="Num Programming Languages")
    num_past_internships: str = Field(alias="Num Past Internships")

    class Config:
        allow_population_by_field_name = True

class PredictionResult(BaseModel):
    good_employee: int

app = FastAPI()

@app.get("/")
def read_root():
    return {"Hello": "World"}

# Main Functionality
@app.post("/prediction", response_model=PredictionResult)
def predict(student: Student) -> Any:
    '''
    Returns a prediction on whether the student will be a good employee
    based on given parameters by using the ML model

    Parameters
    ----------
    student : dict
        A dictionary that contains all fields in Student
    
    Returns
    -------
    dict
        A dictionary satisfying type PredictionResult, contains a single field
        'good_employee' which is either 1 (will be a good employee) or 0 (will
        not be a good employee)
    '''
    student = parse_obj_as(Student, student)
    
    if student is None:
        raise HTTPException(status_code=404, detail="Missing student information")
    
    print("got here")

    clf = joblib.load('./model.pkl')
    
    student = student.dict(by_alias=True)
    query = pd.DataFrame(student, index=[0])
    prediction = clf.predict(query) # TODO: Error handling ??
    prediction = prediction.item()
    returnVal = { 'good_employee': prediction }
    return returnVal
