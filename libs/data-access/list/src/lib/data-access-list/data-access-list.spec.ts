import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DataAccessList } from './data-access-list';

describe('DataAccessList', () => {
  let component: DataAccessList;
  let fixture: ComponentFixture<DataAccessList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataAccessList]
    }).compileComponents();

    fixture = TestBed.createComponent(DataAccessList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
