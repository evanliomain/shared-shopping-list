import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UtilCategories } from './util-categories';

describe('UtilCategories', () => {
  let component: UtilCategories;
  let fixture: ComponentFixture<UtilCategories>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UtilCategories]
    }).compileComponents();

    fixture = TestBed.createComponent(UtilCategories);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
