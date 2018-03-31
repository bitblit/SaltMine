const gulp = require('gulp');
const del = require('del');
const zip = require('gulp-zip');
const ts = require('gulp-typescript');
const tslint = require('gulp-tslint');
const install = require('gulp-install');
const JSON_FILES = ['src/*.json', 'src/**/*.json'];
const IMG_FILES = ['src/*.png', 'src/**/*.png','src/*.jpg', 'src/**/*.jpg'];
const VIEW_FILES = ['src/*.pug', 'src/**/*.pug'];
const SWAGGER_FILES = ['./api-swagger-definition-template.yaml'];

// pull in the project TypeScript config
const tsProject = ts.createProject('tsconfig.json');

gulp.task('scripts', () => {
    const tsResult = tsProject.src()
        .pipe(tsProject());
    return tsResult.js.pipe(gulp.dest('dist'));
});

gulp.task('watch', ['scripts'], () => {
    gulp.watch('src/**/*.ts', ['scripts']);
});

gulp.task('tslint', ()=>
    gulp.src("src/**/*.ts", { base: '.' })
        .pipe(tslint({
            configuration: "tslint.json",
            formatter: "verbose"
        }))
        .pipe(tslint.report())
);

gulp.task('default', ['watch']);